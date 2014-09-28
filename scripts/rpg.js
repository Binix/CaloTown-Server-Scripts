// Global variables inherited from scripts.js
/*global cmp, rpgbot, getTimeString, updateModule, script, sys, saveKey, SESSION, sendChanAll, escape, require, Config, module, nonFlashing, sachannel, staffchannel*/
function RPG(rpgchan) {
    var name = "RPG";
    var game = this;
    var contenturl = "https://raw.github.com/ScottTM17/game-corner/master/rpginfo.json";
    
    var charVersion = 1.1;
    
    var classes;
    var monsters;
    var skills;
    var items;
    var places;
    
    var tick = 0;
    
    var expTable = [40, 94, 166, 263, 393, 568, 804, 1122, 1551, 2130, 2911, 3965, 5387, 7306, 9896, 13392, 18111, 24481, 33080, 44688, 60358, 81512, 110069, 148620, 200663, 270921, 365769, 493813, 666672];
    
    var currentBattles = [];
    var duelChallenges = {};
    var tradeRequests = {};
    var currentParties = [];
    
    var startup = {
        classes: [],
        location: null,
        items: {},
        gold: 0,
        skills: 0,
        stats: 0
    };
    var leveling = {
        hp: 8,
        mp: 4,
        stats: 3,
        skills: 1,
        skillFromOtherClass: false
    };
    var battleSetup = {
        evasion: 0.01,
        defense: 0.018,
        damage: 2,
        party: 6
    };
    
    var altSkills = {};
    var altPlaces = {};
    var altItems = {};
    
    this.changeLocation = function(src, commandData) {
        var player = SESSION.users(src).rpg;
        
        if (player.location === null || player.location === undefined || !(player.location in places)) {
            player.location = startup.location;
            rpgbot.sendMessage(src, "You were in an unknown location! Moving you to the " + places[startup.location].name + "!", rpgchan);
            return;
        }
        
        if (commandData === "*") {
            var out = ["", "You are at the " + places[player.location].name + "! You can move to the following locations: "];
            
            var access = places[player.location].access;
            for (var l in access) {
                var p = places[access[l]];
                out.push(p.name + " (" + access[l] + "): " + p.info + " [Type: " + cap(p.type) + "]");
            }
            
            for (l in out) {
                sys.sendMessage(src, out[l], rpgchan);
            }
            
            return;
        }
        if (player.hp === 0) {
            rpgbot.sendMessage(src, "You can't move while dead!", rpgchan);
            return;
        }
        if (player.isBattling === true) {
            rpgbot.sendMessage(src, "Finish this battle before moving!", rpgchan);
            return;
        }
        
        var loc = commandData.toLowerCase();
        
        if (!(loc in places)) {
            if (loc in altPlaces) {
                loc = altPlaces[loc];
            } else {
                rpgbot.sendMessage(src, "No such place!", rpgchan);
                return;
            }
        }
        if (loc === player.location) {
            rpgbot.sendMessage(src, "You are already here!", rpgchan);
            return;
        }
        if (places[player.location].access.indexOf(loc) === -1) {
            rpgbot.sendMessage(src, "You can't go there from here!", rpgchan);
            return;
        }
        var r, s, req = places[loc].requisites;
        if (places[loc].requisites) {
            if ("key" in req) {
                for (s in req.key) {
                    if (!hasItem(player, s, req.key[s])) {
                        rpgbot.sendMessage(src, "You need at least " + req.key[s] + " " + items[s].name + "(s) to go there!", rpgchan);
                        return;
                    }
                }
            }
            if ("items" in req) {
                for (s in req.items) {
                    if (!hasItem(player, s, req.items[s])) {
                        rpgbot.sendMessage(src, "You need at least " + req.items[s] + " " + items[s].name + "(s) to go there!", rpgchan);
                        return;
                    }
                }
            }
            if ("level" in req) {
                if (player.level < req.level) {
                    rpgbot.sendMessage(src, "You need to be at least level " + req.level + " to go there!", rpgchan);
                    return;
                }
            }
            if ("classes" in req) {
                if (req.classes.indexOf(player.job) === -1) {
                    rpgbot.sendMessage(src, "You can't go there as a " + classes[player.job].name + "!", rpgchan);
                    return;
                }
            }
            if ("attributes" in req) {
                var att = ["hp", "mp", "str", "def", "spd", "mag"];
                for (s in req.attributes) {
                    if (att.indexOf(s) !== -1 && player[s] < req.attributes[s]) {
                        rpgbot.sendMessage(src, "You need at least " + req.attributes[s] + " " + cap(s) + " to go there!", rpgchan);
                        return;
                    }
                }
            }
            if ("events" in req) {
                for (s in req.events) {
                    var ev = req.events[s];
                    var v = s in player.events ? player.events[s] : false;
                    if (ev !== v) {
                        rpgbot.sendMessage(src, "You need to complete a mission to go there!", rpgchan);
                        return;
                    }
                }
            }
            if ("defeated" in req) {
                for (s in req.defeated) {
                    if (!(s in player.defeated) || player.defeated[s] < req.defeated[s]) {
                        rpgbot.sendMessage(src, "You need to defeat " + (req.defeated[s] - (s in player.defeated ? player.defeated[s] : 0)) + " more " + monsters[s].name + "(s) to go there!", rpgchan);
                        return;
                    }
                }
            }
        }
        
        var itemsConsumed = [];
        if (req && req.items) {
            for (r in req.items) {
                changeItemCount(player, r, -1 * req.items[r]);
                itemsConsumed.push(items[r].name + (req.items[r] > 1 ? "(" + req.items[r] + ")" : ""));
            }
        }
        
        var dest = places[loc].access.map(function(x) {
            return places[x].name + " (" + x + ")" ;
        });
        
        player.location = loc;
        sys.sendMessage(src, "", rpgchan);
        rpgbot.sendMessage(src, "You moved to " + places[loc].name + "! ", rpgchan);
        if (dest.length > 0) {
            rpgbot.sendMessage(src, "From here, you can go to " + readable(dest, "or"), rpgchan);
        }
        if (itemsConsumed.length > 0) {
            rpgbot.sendMessage(src, "You consumed " + readable(itemsConsumed, "and") + " to enter here!", rpgchan);
        }
        rpgbot.sendMessage(src, places[loc].welcome, rpgchan);
        sys.sendMessage(src, "", rpgchan);
        
        if (player.party && this.findParty(player.party) && this.findParty(player.party).isMember(src)) {
            this.findParty(player.party).broadcast(player.name + " moved to " + places[loc].name, src);
        }
    };
    this.talkTo = function(src, commandData) {
        var player = SESSION.users(src).rpg;
        
        if (player.hp === 0) {
            rpgbot.sendMessage(src, "You are dead! Type /revive to respawn!", rpgchan);
            return;
        }
        if (player.isBattling === true) {
            rpgbot.sendMessage(src, "Finish this battle before talking to someone!", rpgchan);
            return;
        }
        
        if (commandData === "*") {
            if (places[player.location].npc) {
                sys.sendMessage(src, "", rpgchan);
                sys.sendMessage(src, "You can talk to the following persons:", rpgchan);
                for (var n in places[player.location].npc) {
                    sys.sendMessage(src, cap(n), rpgchan);
                }
                sys.sendMessage(src, "", rpgchan);
                return;
            } else {
                rpgbot.sendMessage(src, "No one to talk to here!", rpgchan);
                return;
            }
        }
        
        if (!("npc" in places[player.location])) {
            rpgbot.sendMessage(src, "No one to talk to here!", rpgchan);
            return;
        }
        
        var people = places[player.location].npc;
        var data = commandData.split(":");
        var person = data[0].toLowerCase();
       
        if (!(person in people)) {
            rpgbot.sendMessage(src, "No such person!", rpgchan);
            return;
        }
        
        var npc = people[person];
        if (data.length < 2) {
            sys.sendMessage(src, npc.message, rpgchan);
            return;
        }
        
        var option = data[1].toLowerCase();
        if (!(option in npc) || option === "message" || option === "notopic") {
            sys.sendMessage(src, npc.notopic, rpgchan);
            return;
        } 
        
        var topic = npc[option];
        if ("requisites" in topic) {
            var req = topic.requisites;
            var r;
            
            if ("classes" in req && req.classes.indexOf(player.job) === -1) {
                sys.sendMessage(src, topic.denymsg, rpgchan);
                return;
            }
            if ("level" in req && player.level < req.level) {
                sys.sendMessage(src, topic.denymsg, rpgchan);
                return;
            }
            if ("events" in req) {
                for (r in req.events) {
                    var ev = req.events[r];
                    var v = r in player.events ? player.events[r] : false;
                    if (ev !== v) {
                        sys.sendMessage(src, topic.denymsg, rpgchan);
                        return;
                    }
                }
            }
            if ("gold" in req && player.gold < req.gold) {
                sys.sendMessage(src, topic.denymsg, rpgchan);
                return;
            }
            if ("items" in req) {
                for (r in req.items) {
                    if (!hasItem(player, r, req.items[r])) {
                        sys.sendMessage(src, topic.denymsg, rpgchan);
                        return; 
                    }
                }
            }
            if ("attributes" in req) {
                var att = ["hp", "mp", "str", "def", "spd", "mag"];
                for (r in req.attributes) {
                    if (att.indexOf(r) !== -1 && player[r] < req.attributes[r]) {
                        sys.sendMessage(src, topic.denymsg, rpgchan);
                        return;
                    }
                }
            }
            if ("defeated" in req) {
                for (r in req.defeated) {
                    if (!(r in player.defeated) || player.defeated[r] < req.defeated[r]) {
                        sys.sendMessage(src, topic.denymsg + " [You need to defeat " + (req.defeated[r] - (r in player.defeated ? player.defeated[r] : 0)) + " more " + monsters[r].name + "(s)]", rpgchan);
                        return;
                    }
                }
            }
            if ("hunt" in req) {
                var noHunt = false;
                if (!(person in player.hunted)) {
                    sys.sendMessage(src, topic.denymsg, rpgchan);
                    player.hunted[person] = {};
                    for (r in req.hunt) {
                        player.hunted[person][r] = 0;
                    }
                    noHunt = true;
                } else {
                    var huntNeeded = [];
                    for (r in req.hunt) {
                        if (!(r in player.hunted[person])) {
                            player.hunted[person][r] = 0;
                            huntNeeded.push(req.hunt[r] + " " + monsters[r].name + "(s)");
                            noHunt = true;
                        } else if (player.hunted[person][r] < req.hunt[r]) {
                            huntNeeded.push((req.hunt[r] - player.hunted[person][r]) + " " + monsters[r].name + "(s)");
                            noHunt = true;
                        }
                    }
                    if (noHunt) {
                        sys.sendMessage(src, topic.denymsg + " [You still need to defeat " + readable(huntNeeded, "and") + "]", rpgchan);
                    }
                }
                if (noHunt) {
                    return;
                }
            }
        }
        
        var it, i, goods, price, ammount = 1, products;
        if ("sell" in topic) {
            products = topic.sell;
            if (data.length < 3) {
                sys.sendMessage(src, "", rpgchan);
                sys.sendMessage(src, topic.message, rpgchan);
                
                for (i in products) {
                    it = items[i];
                    sys.sendMessage(src, it.name + " (" + i + "): " + it.info + " [" + products[i] + " Gold]", rpgchan);
                }
                sys.sendMessage(src, "", rpgchan);
                return;
            }
            
            goods = data[2].toLowerCase();
            
            if (!(goods in products)) {
                sys.sendMessage(src, topic.nobuymsg,rpgchan);
                return;
            }
            
            if (data.length > 3 && isNaN(parseInt(data[3])) === false) {
                ammount = parseInt(data[3]);
                ammount = ammount < 1 ? 1 : ammount;
            }
            
            price = products[goods] * ammount;
            
            if (player.gold < price) {
                sys.sendMessage(src, topic.nogoldmsg.replace(/~Price~/g, price),rpgchan);
                return;
            }
            
            player.gold -= price;
            changeItemCount(player, goods, ammount);
            sys.sendMessage(src, "",rpgchan);
            sys.sendMessage(src, topic.acceptmsg.replace(/~Count~/g, ammount).replace(/~Item~/g, items[goods].name).replace(/~Price~/g, price),rpgchan);
            sys.sendMessage(src, "",rpgchan);
            return;
            
            
        } else if ("buy" in topic) {
            products = topic.buy;
            if (data.length < 3) {
                sys.sendMessage(src, "", rpgchan);
                sys.sendMessage(src, topic.message, rpgchan);
                
                for (i in topic.buy) {
                    it = items[i];
                    sys.sendMessage(src, it.name + " (" + i + "): " + it.info + " [" + topic.buy[i] + " Gold]", rpgchan);
                }
                sys.sendMessage(src, "", rpgchan);
                return;
            }
            
            goods = data[2].toLowerCase();
            
            if (!(goods in products)) {
                sys.sendMessage(src, topic.nosellmsg,rpgchan);
                return;
            }
            
            if (data.length > 3 && isNaN(parseInt(data[3])) === false) {
                ammount = parseInt(data[3]);
                ammount = ammount < 1 ? 1 : ammount;
            }
            
            price = products[goods] * ammount;
            
            if (!hasItem(player, goods, ammount)) {
                sys.sendMessage(src, topic.noitemmsg.replace(/~Count~/g, ammount).replace(/~Item~/g, items[goods].name),rpgchan);
                return;
            }
            
            player.gold += price;
            changeItemCount(player, goods, -ammount);
            sys.sendMessage(src, "",rpgchan);
            sys.sendMessage(src, topic.acceptmsg.replace(/~Count~/g, ammount).replace(/~Item~/g, items[goods].name).replace(/~Price~/g, price),rpgchan);
            sys.sendMessage(src, "",rpgchan);
            return;
        } else if ("effect" in topic) {
            sys.sendMessage(src, "", rpgchan);
            sys.sendMessage(src, topic.message, rpgchan);
            var eff = topic.effect;
            var e;
            
            if ("hp" in eff) {
                player.hp += eff.hp;
                if (player.hp > player.maxhp) {
                    player.hp = player.maxhp;
                } else if (player.hp < 0) {
                    player.hp = 0;
                }
            }
            if ("mp" in eff) {
                player.mp += eff.mp;
                if (player.mp > player.maxmp) {
                    player.mp = player.maxmp;
                } else if (player.mp < 0) {
                    player.mp = 0;
                }
            }
            if ("gold" in eff) {
                player.gold += eff.gold;
                if (player.gold < 0) {
                    player.gold = 0;
                }
                if (eff.gold > 0) {
                    rpgbot.sendMessage(src, "You received " + eff.gold + " Gold!", rpgchan);
                } else if (eff.gold > 0) {
                    rpgbot.sendMessage(src, "You lost " + eff.gold + " Gold!", rpgchan);
                }
            }
            if ("items" in eff) {
                for (e in eff.items) {
                    changeItemCount(player, e, eff.items[e]);
                    if (eff.items[e] > 0) {
                        rpgbot.sendMessage(src, "You received " + eff.items[e] + " " + items[e].name + "(s)!", rpgchan);
                    } else if (eff.items[e] < 0) {
                        rpgbot.sendMessage(src, "You lost " + (-1 * eff.items[e]) + " " + items[e].name + "(s)!", rpgchan);
                    }
                }
            }
            if ("events" in eff) {
                for (e in eff.events) {
                    player.events[e] = eff.events[e];
                }
            }
            if ("move" in eff) {
                player.location = eff.move;
                rpgbot.sendMessage(src, "You moved to " + places[player.location].name + "!", rpgchan);
                rpgbot.sendMessage(src, places[player.location].welcome, rpgchan);
            }
            if ("exp" in eff) {
                this.receiveExp(src, eff.exp);
                if (eff.exp > 0) {
                    rpgbot.sendMessage(src, "You received " + eff.exp + " Exp. Points!", rpgchan);
                }
            }
            if ("classes" in eff) {
                for (e in eff.classes) {
                    if (e === player.job) {
                        this.changePlayerClass(player, eff.classes[e]);
                        rpgbot.sendMessage(src, "You changed classes and are now a " + classes[player.job].name + "!", rpgchan);
                        break;
                    }
                }
            }
            if ("skills" in eff) {
                for (e in eff.skills) {
                    if (!(e in player.skills)) {
                        player.skills[e] = 0;
                    }
                    player.skills[e] += eff.skills[e];
                    if (player.skills[e] < 0) {
                        player.skills[e] = 0;
                    } else if (player.skills[e] > skills[e].levels) {
                        player.skills[e] = skills[e].levels;
                    }
                }
            }
            if ("attributes" in eff) {
                var attr = ["maxhp", "maxmp", "str", "def", "spd", "mag"];
                for (e in eff.attributes) {
                    if (attr.indexOf(e) !== -1) {
                        player[e] += eff.attributes[e];
                        if (player[e] < 1) {
                            player[e] = 1;
                        }
                    }
                }
            }
            if ("resetStats" in eff) {
                this.resetStats(src);
            }
            if ("resetSkills" in eff) {
                this.resetSkills(src);
            }
            if ("monsters" in eff) {
                var m = [];
                for (e in eff.monsters) {
                    for (var c = 0; c < eff.monsters[e]; ++c) {
                        m.push(this.generateMonster(e));
                    }
                }
                if (m.length > 0) {
                     var list;
                    if (player.party && this.findParty(player.party) && this.findParty(player.party).isMember(src)) {
                        list = this.findParty(player.party).findMembersNear(src);
                    } else {
                        list = [[src], [player]];
                    }
                    this.startBattle(list[0], list[1], m);
                }
            }
            if ("hunt" in eff) {
                for (e in eff.hunt) {
                    if (!(person in player.hunted)) {
                        player.hunted[person] = {};
                    }
                    player.hunted[person][e] = eff.hunt[e];
                }
            }
            return;
        }
        
        sys.sendMessage(src, "", rpgchan);
        sys.sendMessage(src, topic.message, rpgchan);
    };
    this.exploreLocation = function(src) {
        var player = SESSION.users(src).rpg;
        
        if (!player.location) {
            rpgbot.sendMessage(src, "You are in an unknown location! Moving you to the starting location.", rpgchan);
            player.location = startup.location;
            return;
        }
        if (SESSION.users(src).rpg.isBattling === true) {
            rpgbot.sendMessage(src, "Finish this battle before exploring!", rpgchan);
            return;
        }
        if (SESSION.users(src).rpg.hp === 0) {
            rpgbot.sendMessage(src, "You are dead! Type /revive to respawn!", rpgchan);
            return;
        }
        if (!("content" in places[player.location])) {
            rpgbot.sendMessage(src, "Nothing to explore here!", rpgchan);
            return;
        }
        
        var content = randomSample(places[player.location].content);
        
        if (content[0] === "*") {
            var item = content.substring(1);
            
            if (isNaN(parseInt(item)) === false && parseInt(item) > 0) {
                rpgbot.sendMessage(src, "You found " + parseInt(item) + " Gold!", rpgchan);
                return;
            }
            
            if (item in items) {
                rpgbot.sendMessage(src, "You found a " + items[item].name + "!", rpgchan);
                changeItemCount(player, item, 1);
                return;
            } else {
                rpgbot.sendMessage(src, "Nothing found!", rpgchan);
                return;
            }
        } else {
            var mob = content.split(":");
            var m = [];
            for (var e in mob) {
                if (mob[e] in monsters) {
                    m.push(this.generateMonster(mob[e]));
                }
            }
            if (m.length === 0) {
                rpgbot.sendMessage(src, "Nothing found!", rpgchan);
                return;
            }
            
            var list;
            if (player.party && this.findParty(player.party) && this.findParty(player.party).isMember(src)) {
                list = this.findParty(player.party).findMembersNear(src);
            } else {
                list = [[src], [player]];
            }
            
            if (list[0].length === 0 || list[1].length === 0) {
                rpgbot.sendMessage(src, "No one on your party can battle!", rpgchan);
                return;
            }
            this.startBattle(list[0], list[1], m);
        }
    };

    this.challengePlayer = function(src, commandData) {
        var player = SESSION.users(src).rpg;
        if (SESSION.users(src).rpg.hp === 0) {
            rpgbot.sendMessage(src, "You are dead! Type /revive to respawn!", rpgchan);
            return;
        }
        if (SESSION.users(src).rpg.isBattling === true) {
            rpgbot.sendMessage(src, "You are already battling! Finish this battle before you challenge someone!", rpgchan);
            return;
        }
        if (commandData === "*" && duelChallenges[player.name] !== undefined) {
            rpgbot.sendMessage(src, "You cancelled your challenge!", rpgchan);
            duelChallenges[player.name] = undefined;
            return;
        }
        var targetId = sys.id(commandData);
        if (targetId === undefined) {
            rpgbot.sendMessage(src, "No such player!", rpgchan);
            return;
        }
        if (targetId === src) {
            rpgbot.sendMessage(src, "You can't battle yourself!", rpgchan);
            return;
        }
        var opponent = SESSION.users(targetId).rpg;
        if (opponent === undefined) {
            rpgbot.sendMessage(src, "This person doesn't have a character!", rpgchan);
            return;
        }
        if (opponent.hp === 0) {
            rpgbot.sendMessage(src, "You can't challenge a dead person!", rpgchan);
            return;
        }
        if (opponent.location !== player.location) {
            rpgbot.sendMessage(src, "You must be at the same location of the person you want to challenge!", rpgchan);
            return;
        }
        var playerName = sys.name(src);
        var targetName = sys.name(targetId);
        
        duelChallenges[playerName] = targetName;
        if (duelChallenges[targetName] && duelChallenges[targetName] === playerName) {
            
            var team1, team2;
            
            if (player.party && opponent.party && player.party === opponent.party) {
                team1 = [[src], [player]];
                team2 = [[targetId], [opponent]];
            } else {
                if (player.party && this.findParty(player.party) && this.findParty(player.party).isMember(src)) {
                    team1 = this.findParty(player.party).findMembersNear(src);
                } else {
                    team1 = [[src], [player]];
                }
                
                if (opponent.party && this.findParty(opponent.party) && this.findParty(opponent.party).isMember(targetId)) {
                    team2 = this.findParty(opponent.party).findMembersNear(targetId);
                } else {
                    team2 = [[targetId], [opponent]];
                }
            }
            
            if (team1[0].length === 0 || team1[1].length === 0 || team2[0].length === 0 || team2[1].length === 0) {
                rpgbot.sendMessage(src, "Battle couldn't begin because one of the teams is not ready!", rpgchan);
                rpgbot.sendMessage(targetId, "Battle couldn't begin because one of the teams is not ready!", rpgchan);
                return;
            } else {
                var names1 = team1[1].map(getTeamNames, this);
                var names2 = team2[1].map(getTeamNames, this);
                
                sys.sendAll("", rpgchan);
                rpgbot.sendAll("A battle between " + readable(names1, "and") + " and " + readable(names2, "and") + " has begun!", rpgchan);
                this.startBattle(team1[0].concat(team2[0]), team1[1], team2[1]);
                sys.sendAll("", rpgchan);
                
                duelChallenges[playerName] = undefined;
                duelChallenges[targetName] = undefined;
            }
        } else {
            rpgbot.sendMessage(src, "You challenged " + targetName + " to a duel! If they accept your challenge, you will automatically start a battle!", rpgchan);
            rpgbot.sendMessage(targetId, "" + playerName + " has challenged you to a duel! To accept it, type /challenge " + playerName + "!", rpgchan);
        }
    };
    this.generateMonster = function(commandData) {
        var monsterName = commandData.toLowerCase();
        var data = monsters[monsterName];
        
        var monster = this.createChar(data);
        
        monster.name = data.name;
        monster.id = monsterName;
        monster.exp = data.exp;
        monster.gold = data.gold;
        monster.loot = data.loot;
        monster.isPlayer = false;
        
        return monster;
    };
    
    this.startBattle = function(viewers, team1, team2) {
        var battle = new Battle(viewers, team1, team2);
        var names1 = [];
        var names2 = [];
        for (var p in team1) {
            names1.push(team1[p].name);
            if (team1[p].isPlayer) {
                team1[p].isBattling = true;
            }
        }
        for (p in team2) {
            names2.push(team2[p].name);
            if (team2[p].isPlayer) {
                team2[p].isBattling = true;
            }
        }
        
        battle.sendToViewers("A battle between " + readable(names1, "and") + " and " + readable(names2, "and") + " has started!");
        
        currentBattles.push(battle);
    };
    this.fleeBattle = function(src) {
        var player = SESSION.users(src).rpg;
        if (player.isBattling === false) {
            rpgbot.sendMessage(src, "You are not battling!", rpgchan);
            return;
        }
        if (player.hp === 0) {
            rpgbot.sendMessage(src, "You are dead!", rpgchan);
            return;
        }
        
        this.quitBattle(src);
    };
    this.quitBattle = function(src) {
        var player = SESSION.users(src).rpg;
        if (player.isBattling) {
            rpgbot.sendMessage(src, "You ran away from a battle!", rpgchan);
        }
        for (var b in currentBattles) {
            currentBattles[b].removePlayer(src);
        }
        player.isBattling = false;
        player.bonus.battle = {
            str: 0,
            def: 0,
            spd: 0,
            mag: 0
        };
    };
    this.reviveSelf = function(src) {
        var player = SESSION.users(src).rpg;
        if (player.hp > 0) {
            rpgbot.sendMessage(src, "You are not even dead!", rpgchan);
            return;
        }
        if (player.isBattling === true) {
            this.quitBattle(src);
        }
        
        player.hp = Math.floor(player.maxhp / 2);
        player.location = startup.location;
        rpgbot.sendMessage(src, "You respawned with " + player.hp + " HP at the " + places[startup.location].name + "!", rpgchan);
    };
    
    function Battle(viewers, teamA, teamB) {
        this.viewers = viewers;
        this.team1 = teamA;
        this.team2 = teamB;
        this.turn = 1;
        this.events = [];
        
        this.team1Exp = 0;
        this.team1Gold = 0;
        this.team2Exp = 0;
        this.team2Gold = 0;
        
        this.isPVP = false;
        
        var p1 = false, p2 = false;
        
        for (var p in this.team1) {
            if (this.team1[p].isPlayer) {
                p1 = true;
                break;
            }
        }
        for (p in this.team2) {
            if (this.team2[p].isPlayer) {
                p2 = true;
                break;
            }
        }
        
        if (p1 && p2) {
            this.isPVP = true;
        }
        
        this.names1 = this.team1.map(getTeamNames, this);
        this.names2 = this.team2.map(getTeamNames, this);
        
        this.defineRewards();
    }
    Battle.prototype.playNextTurn = function() {
        var out = ["<span style='font-weight:bold;'>Turn: " + this.turn + "</span>"];
        var team1 = this.team1;
        var team2 = this.team2;
        
        var isFinished = false;
        var winner;
        
        var priority = [].concat(team1).concat(team2);
        priority.sort(function(a, b) { return (b.spd + b.bonus.battle.spd + b.bonus.equip.spd + b.bonus.skill.spd) - (a.spd + a.bonus.battle.spd + a.bonus.equip.spd + a.bonus.skill.spd); });
        
        for (var i = 0; i < priority.length; ++i) {
            var player = priority[i];
            var side = team1.indexOf(player) !== -1 ? 1 : 2;
            var target;
            var targets = [];
            if (player.hp > 0) {
                var moveName = randomSample(player.strategy);
                var move = skills[moveName];
                var level = player.skills[moveName] - 1;
                
                if (player.mp < move.cost) {
                    out.push(player.name + " tried to use " + move.name + ", but didn't have enough Mana!");
                    continue;
                }
                
                var count = (move.targetCount) ? move.targetCount : 1;
                var added;
                var hitDead = (move.hitDead) ? move.hitDead : "none";
                var targetTeam, n;
                switch (move.target.toLowerCase()) {
                    case "self":
                        targets.push(player);
                        break;
                    case "party":
                        targetTeam = side === 1 ? team1 : team2;
                        targetTeam = shuffle(targetTeam.concat());
                        added = 0;
                        for (n = 0; n < targetTeam.length; ++n) {
                            if (targetTeam[n].hp > 0 && hitDead === "none") {
                                targets.push(targetTeam[n]);
                                added++;
                            } else if (targetTeam[n].hp === 0 && hitDead === "only") {
                                targets.push(targetTeam[n]);
                                added++;
                            } else if (hitDead === "any") {
                                targets.push(targetTeam[n]);
                                added++;
                            }
                            if (added >= count) {
                                break;
                            }
                        }
                        break;
                    case "enemy":
                        targetTeam = side === 1 ? team2 : team1;
                        targetTeam = shuffle(targetTeam.concat());
                        added = 0;
                        for (n = 0; n < targetTeam.length; ++n) {
                            if (targetTeam[n].hp > 0 && hitDead === "none") {
                                targets.push(targetTeam[n]);
                                added++;
                            } else if (targetTeam[n].hp === 0 && hitDead === "only") {
                                targets.push(targetTeam[n]);
                                added++;
                            } else if (hitDead === "any") {
                                targets.push(targetTeam[n]);
                                added++;
                            }
                            if (added >= count) {
                                break;
                            }
                        }
                        break;
                    case "all":
                        targetTeam = [].concat(team2).concat(team1);
                        targetTeam = shuffle(targetTeam.concat());
                        added = 0;
                        for (n = 0; n < targetTeam.length; ++n) {
                            if (targetTeam[n].hp > 0 && hitDead === "none") {
                                targets.push(targetTeam[n]);
                                added++;
                            } else if (targetTeam[n].hp === 0 && hitDead === "only") {
                                targets.push(targetTeam[n]);
                                added++;
                            } else if (hitDead === "any") {
                                targets.push(targetTeam[n]);
                                added++;
                            }
                            if (added >= count) {
                                break;
                            }
                        }
                        break;
                }
                
                player.mp -= move.cost;
                for (var t in targets) {
                    target = targets[t];
                    var defeated = false;
                    var suicide = false;
                    var damage = 0;
                    
                    if ((hitDead === "none" && target.hp == 0) || (hitDead === "only" && target.hp > 0)) {
                        continue;
                    }
                    
                    if (move.type === "physical" || move.type === "magical") {
                        var acc = (move.effect && move.effect.accuracy) ? getLevelValue(move.effect.accuracy, level) : 1;
                        if (!(move.effect && move.effect.snipe && move.effect.snipe === true) && Math.random() * acc < target.spd * battleSetup.evasion) {
                            out.push(player.name + " tried to use " + move.name + ", but " + target.name + " evaded!");
                            continue;
                        }
                        
                        var power = (move.type === "physical" ? player.str + player.bonus.battle.str + player.bonus.equip.str + player.bonus.skill.str : player.mag + player.bonus.battle.mag + player.bonus.equip.mag + player.bonus.skill.mag) * battleSetup.damage * getLevelValue(move.modifier, level);
                        // var def = move.effect && move.effect.pierce && move.effect.pierce === true ? 0 : (target.def + target.bonus.battle.def + target.bonus.equip.def + target.bonus.skill.def) * battleSetup.defense;
                        // damage = Math.floor(power * (1 - def));
                        var hdef = move.effect && move.effect.pierce && move.effect.pierce === true ? 0 : ((target.def + target.bonus.battle.def + target.bonus.equip.def + target.bonus.skill.def) * 0.75) / 100;
                        var sdef = move.effect && move.effect.pierce && move.effect.pierce === true ? 0 : Math.floor((target.def + target.bonus.battle.def + target.bonus.equip.def + target.bonus.skill.def) * 0.25);
                        damage = Math.floor(power * (1 - hdef)) - sdef;
                        // damage = Math.floor(power / def);
                        if ((getLevelValue(move.modifier, level) > 0 && damage < 0) || (getLevelValue(move.modifier, level) < 0 && damage > 0)) {
                            damage = 0;
                        }
                    } 
                    
                    if (move.effect) {
                        var duration = move.effect.duration ? getLevelValue(move.effect.duration, level) : 6;
                        var e;
                        if (move.effect.target) {
                            for (e in move.effect.target) {
                                if (e in target.bonus.battle) {
                                    target.bonus.battle[e] = getLevelValue(move.effect.target[e], level);
                                    this.addBonusEvent(target, "attribute", e, 0, duration);
                                } else if (e === "mp") {
                                    target.mp += getLevelValue(move.effect.target[e], level);
                                } else if (e === "hp") {
                                    damage -= getLevelValue(move.effect.target[e], level);
                                } else if (e === "hpdamage" || e === "mpdamage") {
                                    this.addBonusEvent(target, "damage", e, getLevelValue(move.effect.target[e], level), duration);
                                }
                            }
                        }
                        if (move.effect.user) {
                            for (e in move.effect.user) {
                                if (e in player.bonus.battle) {
                                    player.bonus.battle[e] = getLevelValue(move.effect.user[e], level);
                                    this.addBonusEvent(player, "attribute", e, 0, duration);
                                } else if (e === "mp") {
                                    player.mp += getLevelValue(move.effect.user[e], level);
                                } else if (e === "hp") {
                                    player.hp += getLevelValue(move.effect.user[e], level);
                                } else if (e === "hpdamage" || e === "mpdamage") {
                                    this.addBonusEvent(player, "damage", e, getLevelValue(move.effect.user[e], level), duration);
                                }
                            }
                        }
                    }
                    target.hp -= damage;
                    
                    if (player.hp < 0) {
                        player.hp = 0;
                        suicide = true;
                    } else if (player.hp > player.maxhp) {
                        player.hp = player.maxhp;
                    }
                    if (player.mp < 0) {
                        player.mp = 0;
                    } else if (player.mp > player.maxmp) {
                        player.mp = player.maxmp;
                    }
                    if (target.hp <= 0) {
                        target.hp = 0;
                        defeated = true;
                    } else if (target.hp > target.maxhp) {
                        target.hp = target.maxhp;
                    }
                    if (target.mp < 0) {
                        target.mp = 0;
                    } else if (target.mp > target.maxmp) {
                        target.mp = target.maxmp;
                    }
                    
                    if (moveName === "attack" && player.isPlayer === true && player.equips.rhand !== null && items[player.equips.rhand].message) {
                        out.push(items[player.equips.rhand].message.replace(/~User~/g, nonFlashing(player.name)).replace(/~Target~/g, nonFlashing(target.name)).replace(/~Damage~/g, Math.abs(damage)).replace(/~Life~/, target.hp).replace(/~Mana~/, target.mp));
                    } else {
                        out.push(move.message.replace(/~User~/g, nonFlashing(player.name)).replace(/~Target~/g, nonFlashing(target.name)).replace(/~Damage~/g, Math.abs(damage)).replace(/~Life~/, target.hp).replace(/~Mana~/, target.mp));
                    }
                    
                    if (suicide && target !== player) {
                        out.push(nonFlashing(player.name) + " was defeated!");
                    }
                    if (defeated) {
                        out.push(nonFlashing(target.name) + " was defeated!");
                    }
                }
            }
        }
        
        var ev;
        var trans = {
            str: "Strength",
            def: "Defense",
            spd: "Speed",
            mag: "Magic"
        };
        for (var j = this.events.length - 1; j >= 0; --j) {
            ev = this.events[j];
            ev.countDown();
            
            if (ev.duration <= 0) {
                if (ev.type === "attribute") {
                    ev.applyEffect();
                    out.push(nonFlashing(ev.target.name) + "'s " + trans[ev.attribute] + " is back to normal.");
                }
                this.events.splice(j, 1);
            } else {
                if (ev.type === "damage") {
                    
                    if (ev.target.hp < 0) {
                        ev.target.hp = 0;
                    } else if (ev.target.hp > ev.target.maxhp) {
                        ev.target.hp = ev.target.maxhp;
                    }
                    if (ev.target.mp < 0) {
                        ev.target.mp = 0;
                    } else if (ev.target.mp > ev.target.maxmp) {
                        ev.target.mp = ev.target.maxmp;
                    }
                    
                    var w = ev.attribute === "mpdamage" ? "Mana" : "HP";
                    var att = ev.attribute === "mpdamage" ? Math.abs(ev.target.mp) : Math.abs(ev.target.hp);
                    var verb = ev.count > 0 ? "gained" : "lost";
                    out.push(nonFlashing(ev.target.name) + " " + verb + " " + ev.count + " " + w + " and now has " + att + "!");
                    
                    if (ev.target.hp === 0) {
                        out.push(ev.target.name + " was defeated!");
                    }
                }
            }
        }
        
        var x;
        this.sendToViewers("");
        for (x in out) {
            this.sendToViewers(out[x]);
        }
        winner = this.checkWin();
        if (winner !== null) {
            this.finishBattle(winner);
        }
        this.turn++;
    };
    Battle.prototype.checkWin = function() {
        var defeated1 = true;
        var defeated2 = true;
        var winner = null;
        
        //Check if team1 was defeated
        for (var o in this.team1) {
            if (this.team1[o].hp > 0) {
                defeated1 = false;
                break;
            }
        }
        
        //Check if team2 was defeated
        for (o in this.team2) {
            if (this.team2[o].hp > 0) {
                defeated2 = false;
                break;
            }
        }
        
        if (defeated1 || defeated2) {
            // isFinished = true;
            if (defeated1 && defeated2) {
                winner = 0;
            } else if (!defeated1 && defeated2) {
                winner = 1;
            } else if (defeated1 && !defeated2) {
                winner = 2;
            }
        }
        
        return winner;
    };
    Battle.prototype.sendToViewers = function(msg) {
        for (var v in this.viewers) {
            // sys.sendMessage(this.viewers[v], msg, rpgchan);
            if (msg === "") {
                sys.sendHtmlMessage(this.viewers[v], '<span style="font-size:10px;">' + msg + '</span>', rpgchan);
            } else {
                sys.sendHtmlMessage(this.viewers[v], '<span style="font-size:10px;"><timestamp/>' + msg + '</span>', rpgchan);
            }
        }
    };
    Battle.prototype.defineRewards = function() {
        var p, player;
        this.lower = expTable.length;
        this.higher = 0;
        
        var all = [].concat(this.team1).concat(this.team2);
        
        for (p in all) {
            if (all[p].isPlayer) {
                if (all[p].level < this.lower) {
                    this.lower = all[p].level;
                }
                if (all[p].level > this.higher) {
                    this.higher = all[p].level;
                }
            }
        }
        
        for (p in this.team1) {
            player = this.team1[p];
            if (player.isPlayer === true) {
                this.team1Gold += Math.floor(player.gold * 0.1);
                this.team1Exp += Math.floor(this.lower / this.higher * player.exp * 0.2);
            }
        }
        for (p in this.team2) {
            player = this.team2[p];
            if (player.isPlayer === true) {
                this.team2Gold += Math.floor(player.gold * 0.1);
                this.team2Exp += Math.floor(this.lower / this.higher * player.exp * 0.2);
            }
        }
    };
    Battle.prototype.finishBattle = function(win) {
        var winner = (win === 1) ? this.team1 : this.team2;
        var loser = (win === 1) ? this.team2 : this.team1;
        
        var winNames = winner.map(getTeamNames, this);
        var loseNames = loser.map(getTeamNames, this);
        
        if (this.isPVP) {
            if (win === 0) {
                rpgbot.sendAll("The battle between " + readable(winNames, "and") + " and " + readable(loseNames, "and") + " ended in a draw!", rpgchan);
            } else {
                winNames = (win === 1) ? this.names1 : this.names2;
                loseNames = (win === 1) ? this.names2 : this.names1;
                
                rpgbot.sendAll(readable(winNames, "and") + " defeated " + readable(loseNames, "and") + "!", rpgchan);
            }
        } else {
            if (win === 0) {
                this.sendToViewers("The battle between " + readable(winNames, "and") + " and " + readable(loseNames, "and") + " ended in a draw!");
            } else {
                this.sendToViewers(readable(winNames, "and") + " defeated " + readable(loseNames, "and") + "!");
            }
        }
        
        var gold = 0;
        var monsterExp = 0;
        var playerExp = 0;
        
        if (win === 0) {
            loser = loser.concat(winner);
        } else {
            gold += (win === 1) ? this.team2Gold : this.team1Gold;
            playerExp += (win === 1) ? this.team2Exp : this.team1Exp;
        }
        
        for (var p in loser) {
            var lost = loser[p];
            if (lost.isPlayer) {
                //rpgbot.sendMessage(lost.id, "You lost " + Math.floor(lost.gold * 0.1) + " Gold!", rpgchan);
                //lost.gold = Math.floor(lost.gold * 0.9);
            } else {
                if (lost.gold) {
                    gold += Math.floor(lost.gold);
                }
                if (lost.exp) {
                    monsterExp += Math.floor(lost.exp);
                }
            }
        }
        
        if (win !== 0) {
            gold = Math.floor(gold / winner.length);
            monsterExp = Math.floor(monsterExp / winner.length);
            // playerExp = Math.floor(playerExp / winner.length);
            playerExp = 0;
            
            var l, m, loot, gainedExp;
            for (p in winner) {
                var won = winner[p];
                if (won.isPlayer) {
                    rpgbot.sendMessage(won.id, "You received " + gold + " Gold!", rpgchan);
                    won.gold += gold;
                    
                    for (l in loser) {
                        m = loser[l];
                        if (m.isPlayer === false) {
                            for (var c in won.hunted) {
                                if (m.id in won.hunted[c]) {
                                    won.hunted[c][m.id] += 1;
                                }
                            }
                            if (!(m.id in won.defeated)) {
                                won.defeated[m.id] = 0;
                            }
                            won.defeated[m.id]++;
                            if (m.loot) {
                                loot = randomSample(m.loot);
                                if (loot !== "none") {
                                    changeItemCount(won, loot, 1);
                                    rpgbot.sendMessage(won.id, "You found a " + items[loot].name + "!", rpgchan);
                                }
                            }
                        }
                    }
                    gainedExp = monsterExp + Math.floor(playerExp / won.level);
                    if (gainedExp > 0) {
                        rpgbot.sendMessage(won.id, "You received " + gainedExp + " Exp. Points!", rpgchan);
                        game.receiveExp(won.id, gainedExp);
                    }
                }
            }
        }
        this.destroyBattle();
    };
    Battle.prototype.removePlayer = function(src) {
        var name = SESSION.users(src).rpg.name;
        var found = false;
        for (var s in this.team1) {
            if (this.team1[s].name === name) {
                this.team1.splice(s, 1);
                found = true;
                break;
            }
        }
        for (s in this.team2) {
            if (this.team2[s].name === name) {
                this.team2.splice(s, 1);
                found = true;
                break;
            }
        }
        if (found) {
            var player = SESSION.users(src).rpg;
            if (player.hp === 0 || this.isPVP === true) {
                rpgbot.sendMessage(src, "You lost " + Math.floor(player.gold * 0.1) + " Gold!", rpgchan);
                player.gold = Math.floor(player.gold * 0.9);
            }
            this.sendToViewers(name + " ran away!");
            this.viewers.splice(this.viewers.indexOf(src), 1);
            
            
            if (this.team1.length === 0 || this.team2.length === 0) {
                this.sendToViewers("No opponents left!");
                if (this.isPVP === false) {
                    this.destroyBattle();
                    return;
                }
            } 
            
            var winner = this.checkWin();
            if (winner !== null) {
                this.finishBattle(winner);
            }
        }
    };
    Battle.prototype.destroyBattle = function(){
        var allPlayers = [].concat(this.team1).concat(this.team2);
        for (var p in allPlayers) {
            if (allPlayers[p].isPlayer) {
                allPlayers[p].isBattling = false;
                allPlayers[p].bonus.battle = {
                    str: 0,
                    def: 0,
                    spd: 0,
                    mag: 0
                };
            }
        }
        currentBattles.splice(currentBattles.indexOf(this), 1);
    };
    Battle.prototype.addBonusEvent = function(target, type, attribute, count, duration) {
        for (var e = this.events.length - 1; e >= 0; --e) {
            var ev = this.events[e];
            if (ev.target === target && ev.attribute === attribute) {
                this.events.splice(e, 1);
            }
        }
        this.events.push(new BattleEvent(type, duration, target, attribute, count));
    };
    
    function BattleEvent(type, dur, target, att, count) {
        this.type = type;
        this.duration = dur;
        this.target = target;
        this.attribute = att;
        this.count = count;
    }
    BattleEvent.prototype.countDown = function() {
        this.duration--;
        if (this.type === "damage") {
            this.applyEffect();
        }
    };
    BattleEvent.prototype.applyEffect = function() {
        switch (this.type) {
            case "attribute":
                this.target.bonus.battle[this.attribute] = this.count;
                break;
            case "damage":
                if (this.attribute === "hpdamage") {
                    this.target.hp += this.count;
                } else if (this.attribute === "mpdamage") {
                    this.target.mp += this.count;
                }
                break;
        }
    };
    function getTeamNames(x) {
        return x.name;
    }
    function getLevelValue(att, level) {
        if (Array.isArray(att)) {
            if (level < att.length) {
                return att[level];
            } else {
                return att[att.length - 1];
            }
        } else {
            return att;
        }
    }
    
    this.useItem = function(src, commandData) {
        var player = SESSION.users(src).rpg;
        
        if (commandData === "*") {
            var out = ["", "Items: "];
            
            for (var i in player.items) {
                out.push(player.items[i] + "x " + items[i].name + " (" + i + "): " + items[i].info);
            }
            
            out.push("");
            out.push("Equipment: ");
            out.push("Right Hand: " + (player.equips.rhand === null ? "Nothing" : items[player.equips.rhand].name));
            out.push("Left Hand: " + (player.equips.lhand === null ? "Nothing" : items[player.equips.lhand].name));
            out.push("Body: " + (player.equips.body === null ? "Nothing" : items[player.equips.body].name));
            out.push("Head: " + (player.equips.head === null ? "Nothing" : items[player.equips.head].name));
            
            out.push("");
            out.push("To use or equip an item, type /item itemName");
            out.push("");
            
            for (var x in out) {
                sys.sendMessage(src, out[x], rpgchan);
            }
            return;
        }
        
        var data = commandData.split(":");
        
        if (player.hp === 0) {
            rpgbot.sendMessage(src, "You can't use an item while dead!", rpgchan);
            return;
        }
        /* if (player.isBattling === true) {
            rpgbot.sendMessage(src, "You can't use items during a battle!", rpgchan);
            return;
        } */
        var it = data[0].toLowerCase();
        
        if (!hasItem(player, it, 1)) {
            if (it in altItems) {
                it = altItems[it];
            } else {
                rpgbot.sendMessage(src, "You don't have this item!", rpgchan);
                return;
            }
        }
        
        var item = items[it];
        
        if (data.length > 1 && data[1].toLowerCase() === "drop") {
            changeItemCount(player, it, -1);
            rpgbot.sendMessage(src, "You have dropped a " + item.name + "!", rpgchan);
            return;
        }
        
        if (item.level > player.level) {
            rpgbot.sendMessage(src, "You need to be at least level " + item.level + " to use this item!", rpgchan);
            return;
        }
        
        if (item.classes && item.classes.indexOf(player.job) === -1) {
            rpgbot.sendMessage(src, "You can't use this item as " + classes[player.job].name + "!", rpgchan);
            return;
        }
        
        sys.sendMessage(src, "", rpgchan);
        if (item.type === "usable") {
            if (item.effect) {
                if ("hp" in item.effect) {
                    player.hp += item.effect.hp;
                    if (player.hp < 0) {
                        player.hp = 0;
                    } else if (player.hp > player.maxhp) {
                        player.hp = player.maxhp;
                    }
                }
                if ("mp" in item.effect) {
                    player.mp += item.effect.mp;
                    if (player.mp < 0) {
                        player.mp = 0;
                    } else if (player.mp > player.maxmp) {
                        player.mp = player.maxmp;
                    }
                }
            }
            rpgbot.sendMessage(src, item.message, rpgchan);
            changeItemCount(player, it, -1);
        } else if (item.type === "equip") {
            var slot = item.slot;
            if (player.equips.rhand === it || player.equips.lhand === it || player.equips.body === it || player.equips.head === it) {
                this.removeEquip(src, it);
                rpgbot.sendMessage(src, items[it].name + " unequipped!", rpgchan);
                return;
            }
            if (item.slot === "2-hands") {
                slot = "rhand";
                if (player.equips.lhand !== null) {
                    rpgbot.sendMessage(src, items[player.equips.lhand].name + " unequipped!", rpgchan);
                    player.equips.lhand = null;
                }
            } else if ((item.slot === "rhand" || item.slot === "lhand") && player.equips.rhand !== null && items[player.equips.rhand].slot === "2-hands") {
                if (player.equips.rhand !== null) {
                    rpgbot.sendMessage(src, items[player.equips.rhand].name + " unequipped!", rpgchan);
                    player.equips.rhand = null;
                }
            }
            if (player.equips[slot] !== null) {
                rpgbot.sendMessage(src, items[player.equips[slot]].name + " unequipped!", rpgchan);
                player.equips[slot] = null;
            }
            rpgbot.sendMessage(src, items[it].name + " equipped!", rpgchan);
            player.equips[slot] = it;
            this.updateBonus(src);
        } else {
            rpgbot.sendMessage(src, "This item cannot be used!", rpgchan);
        }
    };
    this.removeEquip = function(src, item) {
        var equips = SESSION.users(src).rpg.equips;
        
        if (equips.rhand === item) {
            equips.rhand = null;
        }
        if (equips.lhand === item) {
            equips.lhand = null;
        }
        if (equips.body === item) {
            equips.body = null;
        }
        if (equips.head === item) {
            equips.head = null;
        }
        this.updateBonus(src);
    };
    this.requestTrade = function(src, commandData) {
        var player = SESSION.users(src).rpg;
        if (commandData === "*" && tradeRequests[player.name] !== undefined) {
            rpgbot.sendMessage(src, "You cancelled your trade request!", rpgchan);
            tradeRequests[player.name] = undefined;
            return;
        }
        var data = commandData.split(":");
        if (data.length < 3) {
            rpgbot.sendMessage(src, "Incorrect formatting! Use /trade Player:ItemYouOffer:ItemYouWant to request a trade!", rpgchan);
            return;
        }
        var targetId = sys.id(data[0].toLowerCase());
        if (targetId === undefined) {
            rpgbot.sendMessage(src, "No such player!", rpgchan);
            return;
        }
        if (targetId === src) {
            rpgbot.sendMessage(src, "You can't trade with yourself!", rpgchan);
            return;
        }
        if (SESSION.users(targetId).rpg === undefined) {
            rpgbot.sendMessage(src, "This person doesn't have a character!", rpgchan);
            return;
        }
        var itemOffered = data[1].toLowerCase();
        var itemWanted = data[2].toLowerCase();
        
        if (isNaN(parseInt(itemOffered)) === true) {
            if (!(itemOffered in items)) {
                if (itemOffered in altItems) {
                    itemOffered = altItems[itemOffered];
                } else {
                    rpgbot.sendMessage(src, "The item " + itemOffered + " doesn't exist!", rpgchan);
                    return;
                }
            }
            if (!hasItem(player, itemOffered, 1)) {
                rpgbot.sendMessage(src, "You don't have this item!", rpgchan);
                return;
            }
        } else {
            itemOffered = parseInt(itemOffered);
        }
        if (isNaN(parseInt(itemWanted)) === true) {
            if (!(itemWanted in items)) {
                if (itemWanted in altItems) {
                    itemWanted = altItems[itemWanted];
                } else {
                    rpgbot.sendMessage(src, "The item " + itemWanted + " doesn't exist!", rpgchan);
                    return;
                }
            }
        } else {
            itemWanted = parseInt(itemWanted);
        }
        
        var playerName = player.name;
        var target = SESSION.users(targetId).rpg;
        var targetName = target.name;
        
        var offer = typeof itemOffered === "number" ? itemOffered + " Gold" : items[itemOffered].name;
        var wanted = typeof itemWanted === "number" ? itemWanted + " Gold" : items[itemWanted].name;
        
        tradeRequests[playerName] = [targetName, itemOffered, itemWanted];
        if (tradeRequests[targetName] && tradeRequests[targetName][0] === playerName) {
            var playerTrade = tradeRequests[playerName];
            var targetTrade = tradeRequests[targetName];
            if (playerTrade[1] === targetTrade[2] && playerTrade[2] === targetTrade[1]) {
                if (typeof itemOffered === "number") {
                    if (player.gold >= itemOffered) {
                        player.gold -= itemOffered;
                        target.gold += itemOffered;
                    } else {
                        rpgbot.sendMessage(src, "Trade cancelled because you don't have " + itemOffered + " Gold!", rpgchan);
                        rpgbot.sendMessage(targetId, "Trade cancelled because " + playerName + " doesn't have " + itemOffered + " Gold!", rpgchan);
                        return;
                    }
                } else {
                    changeItemCount(player, itemOffered, -1);
                    changeItemCount(target, itemOffered, 1);
                }
                
                if (typeof itemWanted === "number") {
                    if (target.gold >= itemWanted) {
                        target.gold -= itemWanted;
                        player.gold += itemWanted;
                    } else {
                        rpgbot.sendMessage(targetId, "Trade cancelled because you don't have " + itemWanted + " Gold!", rpgchan);
                        rpgbot.sendMessage(src, "Trade cancelled because " + targetName + " doesn't have " + itemWanted + " Gold!", rpgchan);
                        return;
                    }
                } else {
                    changeItemCount(target, itemWanted, -1);
                    changeItemCount(player, itemWanted, 1);
                }
                
                rpgbot.sendMessage(src, "You traded your " + offer + " with " + targetName + "'s " + wanted + "!", rpgchan);
                rpgbot.sendMessage(targetId, "You traded your " + wanted + " with " + playerName + "'s " + offer + "!", rpgchan);
                
                tradeRequests[playerName] = undefined;
                tradeRequests[targetName] = undefined;
                
                if (typeof itemOffered === "string" && !hasItem(player, itemOffered, 1)) {
                    this.removeEquip(src, itemOffered);
                }
                if (typeof itemWanted === "string" && !hasItem(target, itemWanted, 1)) {
                    this.removeEquip(targetId, itemWanted);
                }
                this.saveGame(src);
                this.saveGame(targetId);
                
            } else {
                rpgbot.sendMessage(src, "You offered " + offer + " for " + targetName + "'s " + wanted + "!", rpgchan);
                rpgbot.sendMessage(targetId, playerName + " offered " + offer + " for your " + wanted + "! To accept the trade, type /trade " + sys.name(src) + ":" + itemWanted + ":" + itemOffered, rpgchan);
                
                rpgbot.sendMessage(src, "You and " + targetName + " didn't come to an agreement!", rpgchan);
                rpgbot.sendMessage(targetId, "You and " + playerName + " didn't come to an agreement!", rpgchan);
            }
        } else {
            rpgbot.sendMessage(src, "You offered " + offer + " for " + targetName + "'s " + wanted + "!", rpgchan);
            rpgbot.sendMessage(targetId, playerName + " offered " + offer + " for your " + wanted + "! To accept the trade, type /trade " + sys.name(src) + ":" + itemWanted + ":" + itemOffered, rpgchan);
        }
    };
    this.updateBonus = function(src) {
        var player = SESSION.users(src).rpg;
        
        player.maxhp -= player.bonus.equip.maxhp;
        player.maxmp -= player.bonus.equip.maxmp;
        
        if (player.hp > player.maxhp) {
            player.hp = player.maxhp;
        }
        if (player.mp > player.maxmp) {
            player.mp = player.maxmp;
        }
        
        player.bonus.equip.maxhp = 0;
        player.bonus.equip.maxmp = 0;
        player.bonus.equip.str = 0;
        player.bonus.equip.def = 0;
        player.bonus.equip.spd = 0;
        player.bonus.equip.mag = 0;
        
        var equip;
        for (var x in player.equips) {
            equip = player.equips[x];
            if (equip !== null) {
                equip = items[equip];
                if (equip.effect) {
                    for (var s in equip.effect) {
                        if (s in player.bonus.equip) {
                            player.bonus.equip[s] += equip.effect[s];
                        }
                    }
                }
            }
        }
        
        player.maxhp += player.bonus.equip.maxhp;
        player.maxmp += player.bonus.equip.maxmp;
    };
    this.gotoInn = function(src) {
        var player = SESSION.users(src).rpg;
        if (player.hp === 0) {
            rpgbot.sendMessage(src, "Use /revive first!", rpgchan);
            return;
        }
        if (player.gold < 10) {
            rpgbot.sendMessage(src, "Not enough Gold! You need at least 10 Gold!", rpgchan);
            return;
        }
        /* if (player.isBattling === true) {
            rpgbot.sendMessage(src, "Finish this battle before going to an Inn!", rpgchan);
            return;
        } */
        sys.sendMessage(src, "", rpgchan);
        rpgbot.sendMessage(src, "You slept in the Inn and are fully recovered now!", rpgchan);
        sys.sendMessage(src, "", rpgchan);
        player.gold -= 10;
        player.hp = player.maxhp;
        player.mp = player.maxmp;
    };
    function changeItemCount(player, item, ammount) {
        if (!(item in player.items)) {
            player.items[item] = 0;
        }
        player.items[item] += ammount;
        if (player.items[item] <= 0) {
            delete player.items[item];
        }
    }
    function hasItem(player, item, ammount) {
        var count = ammount || 1;
        if (!(item in player.items)) {
            return false;
        } else if (player.items[item] >= count) {
            return true;
        }
    }
    
    this.receiveExp = function(src, commandData) {
        var player = SESSION.users(src).rpg;
        player.exp += commandData;
        
        if (player.exp > expTable[expTable.length-1]) {
            player.exp = expTable[expTable.length-1];
        }
        
        var e;
  	for (e = expTable.length; e >= 0; --e) {
			if (player.exp >= expTable[e - 1]) {
				e = e + 1;
				break;
			}
		}
        
        if (e > player.level) {
            var dif = e - player.level;
            player.statPoints += leveling.stats * dif;
            player.skillPoints += leveling.skills * dif;
            
            sys.sendAll("", rpgchan);
            rpgbot.sendAll(player.name + "'s Level increased from " + player.level + " to " + e + "!", rpgchan);
            sys.sendAll("", rpgchan);
            player.level = e;
        }
    };
    this.addPoint = function(src, commandData) {
        var data = commandData.split(":");
        
        // if (data.length < 2) {
        if (commandData === "*") {
            rpgbot.sendMessage(src, "To increase an stat or skill, type /increase statName:ammount or /increase skillName:ammount.", rpgchan);
            return;
        }
        
        var what = data[0].toLowerCase();
        var ammount;
        ammount = data.length > 1 ? parseInt(data[1]) : 1;
        ammount = isNaN(ammount) ? 1 : ammount;
        
        var player = SESSION.users(src).rpg;
        
        var attributes = ["life", "hp", "mana", "mp", "str", "strength", "def", "defense", "spd", "speed", "mag", "magic"];
        
        if (attributes.indexOf(what) !== -1) {
            if (player.statPoints <= 0) {
                rpgbot.sendMessage(src, "You have no stat points to increase!", rpgchan);
                return;
            }
            if (player.statPoints < ammount) {
                rpgbot.sendMessage(src, "You don't have that much stat points!", rpgchan);
                return;
            }
            switch (what) {
                case "life":
                case "hp":
                    player.maxhp += leveling.hp * ammount;
                    player.hp += leveling.hp * ammount;
                    rpgbot.sendMessage(src, "Maximum HP increased to " + player.maxhp + "!", rpgchan);
                    player.statPoints -= ammount;
                    break;
                case "mana":
                case "mp":
                    player.maxmp += leveling.mp * ammount;
                    player.mp += leveling.mp * ammount;
                    rpgbot.sendMessage(src, "Maximum Mana increased to " + player.maxmp + "!", rpgchan);
                    player.statPoints -= ammount;
                    break;
                case "str":
                case "strength":
                    player.str += 1 * ammount;
                    rpgbot.sendMessage(src, "Strength increased to " + player.str + "!", rpgchan);
                    player.statPoints -= ammount;
                    break;
                case "def":
                case "defense":
                    player.def += 1 * ammount;
                    rpgbot.sendMessage(src, "Defense increased to " + player.def + "!", rpgchan);
                    player.statPoints -= ammount;
                    break;
                case "spd":
                case "speed":
                    player.spd += 1 * ammount;
                    rpgbot.sendMessage(src, "Speed increased to " + player.spd + "!", rpgchan);
                    player.statPoints -= ammount;
                    break;
                case "mag":
                case "magic":
                    player.mag += 1 * ammount;
                    rpgbot.sendMessage(src, "Magic increased to " + player.mag + "!", rpgchan);
                    player.statPoints -= ammount;
                    break;
                default:
                    rpgbot.sendMessage(src, "You can only increase HP, Mana, Str, Def, Spd or Mag!", rpgchan);
                    break;
            }
        } else {
            if (player.skillPoints <= 0) {
                rpgbot.sendMessage(src, "You have no skill points to increase!", rpgchan);
                return;
            }
            if (player.skillPoints < ammount) {
                rpgbot.sendMessage(src, "You don't have that much skill points!", rpgchan);
                return;
            }
            if (!(what in skills)) {
                if (what in altSkills) {
                    what = altSkills[what];
                } else {
                    rpgbot.sendMessage(src, "There's no such skill!", rpgchan);
                    return;
                }
            }
            if (leveling.skillFromOtherClass === false &&!(what in classes[player.job].skills)) {
                rpgbot.sendMessage(src, "You can only increase skills from your current class!", rpgchan);
                return;
            } 
            if (!(what in player.skills)) {
                rpgbot.sendMessage(src, "You can't learn this skill!", rpgchan);
                return;
            }
            if (skills[what].requisites) {
                var req = skills[what].requisites;
                if (req.level && player.level < req.level) {
                    rpgbot.sendMessage(src, "You need to be at least level " + req.level + " to learn this skill!", rpgchan);
                    return;
                }
                if (req.maxhp && player.maxhp < req.maxhp) {
                    rpgbot.sendMessage(src, "You need at least " + req.maxhp + " HP to learn this skill!", rpgchan);
                    return;
                }
                if (req.maxmp && player.maxmp < req.maxmp) {
                    rpgbot.sendMessage(src, "You need at least " + req.maxmp + " Mana to learn this skill!", rpgchan);
                    return;
                }
                if (req.str && player.str < req.str) {
                    rpgbot.sendMessage(src, "You need at least " + req.str + " Strength to learn this skill!", rpgchan);
                    return;
                }
                if (req.def && player.def < req.def) {
                    rpgbot.sendMessage(src, "You need at least " + req.def + " Defense to learn this skill!", rpgchan);
                    return;
                }
                if (req.spd && player.spd < req.spd) {
                    rpgbot.sendMessage(src, "You need at least " + req.spd + " Speed to learn this skill!", rpgchan);
                    return;
                }
                if (req.mag && player.mag < req.mag) {
                    rpgbot.sendMessage(src, "You need at least " + req.mag + " Magic to learn this skill!", rpgchan);
                    return;
                }
                if (req.skill) {
                    for (var s in req.skill) {
                        if (!(s in player.skills) || player.skills[s] < req.skill[s]) {
                            rpgbot.sendMessage(src, "You need at least " + skills[s].name + " at level " + req.skill[s] + " to learn this skill!", rpgchan);
                            return;
                        }
                    }
                }
            }
            if (!(what in player.skills)) {
                player.skills[what] = 0;
            }
            if (player.skills[what] === skills[what].levels) {
                rpgbot.sendMessage(src, "This skill is already maxed!", rpgchan);
                return;
            }
            if (player.skills[what] + ammount > skills[what].levels) {
                rpgbot.sendMessage(src, "You can't add that much skill points to this skill!", rpgchan);
                return;
            }
            player.skills[what] += ammount;
            player.skillPoints -= ammount;
            rpgbot.sendMessage(src, "You increased your " + skills[what].name + " skill to level " + player.skills[what] + "!", rpgchan);
        }
    };
    this.setBattlePlan = function(src, commandData) {
        var player = SESSION.users(src).rpg;
        if (commandData === "*") {
            rpgbot.sendMessage(src, "Your current strategy is " + randomSampleText(player.strategy, function(x) { return skills[x].name; } ) + ".", rpgchan);
            rpgbot.sendMessage(src, "To set your strategy, type /plan skill:chance*skill:chance. You can also use /plan slots to save up to 3 strategies.", rpgchan);
            return;
        }

        var broken = commandData.split(" ");
        var action = "plan";
        var target;
        
        if (broken[0] === "slots") {
            sys.sendMessage(src, "", rpgchan);
            rpgbot.sendMessage(src, "Your saved strategy 1 is " + randomSampleText(player.plans[0], function(x) { return skills[x].name; } ) + ".", rpgchan);
            rpgbot.sendMessage(src, "Your saved strategy 2 is " + randomSampleText(player.plans[1], function(x) { return skills[x].name; } ) + ".", rpgchan);
            rpgbot.sendMessage(src, "Your saved strategy 3 is " + randomSampleText(player.plans[2], function(x) { return skills[x].name; } ) + ".", rpgchan);
            rpgbot.sendMessage(src, "To save a strategy, use /plan set [slot] [strategy]. To load a saved strategy, use /plan load [slot].", rpgchan);
            sys.sendMessage(src, "", rpgchan);
            return;
        }
        
        if (broken.length > 1) {
            action = broken[0].toLowerCase();
            target = parseInt(broken[1]);
            commandData = broken[2];
        }
        
        if (action === "load") {
            if (player.plans[target-1]) {
                player.strategy = player.plans[target-1];
                rpgbot.sendMessage(src, "Loaded strategy " + randomSampleText(player.strategy, function(x) { return skills[x].name; } ) + ".", rpgchan);
            } else {
                rpgbot.sendMessage(src, "No plan set here!", rpgchan);
            }
            return;
        }
        
        var data = commandData.split("*");
        var obj = {};
        var skill;
        
        for (var s in data) {
            skill = data[s].split(":");
            if (skill.length < 2) {
                rpgbot.sendMessage(src, "Incorrect format. To set your strategy, type /plan skill:chance*skill:chance.", rpgchan);
                return;
            }
            var move = skill[0].toLowerCase();
            var chance = parseFloat(skill[1]);
            
            if (!(move in skills)) {
                if(move in altSkills) {
                    move = altSkills[move];
                } else {
                    rpgbot.sendMessage(src, "The skill '" + move + "' doesn't exist!", rpgchan);
                    return;
                }
            }
            if (!(move in player.skills) || player.skills[move] === 0) {
                rpgbot.sendMessage(src, "You haven't learned the skill '" + move + "'!", rpgchan);
                return;
            }
            
            if (typeof chance !== "number" || isNaN(chance) === true) {
                rpgbot.sendMessage(src, "Set a chance for the skill '" + move + "'!", rpgchan);
                return;
            }
            obj[move] = chance;
        }
        
        if (action === "set") {
            if (target === 1 || target === 2 || target === 3) {
                player.plans[target-1] = obj;
                rpgbot.sendMessage(src, "Saved strategy " + randomSampleText(obj, function(x) { return skills[x].name; } ) + " to slot " + target + "!", rpgchan);
            } else {
                rpgbot.sendMessage(src, "No such slot for strategies!", rpgchan);
            }
            return;
        } else {
            player.strategy = obj;
            rpgbot.sendMessage(src, "You strategy was set to " + randomSampleText(obj, function(x) { return skills[x].name; } ) + "!", rpgchan);
        }
        
    };
    this.changePlayerClass = function(player, job) {
        if (job !== player.job) {
            player.job = job;
            
            for (var s in classes[job].skills) {
                if (!(s in player.skills)) {
                    player.skills[s] = classes[job].skills[s];
                }
            }
        
        }
    };
    function randomSampleText(obj, translator) {
        var total = 0, count = 0, list = [], s;
        for (s in obj) {
            total += obj[s];
            count++;
        }
        for (s in obj) {
            list.push(translator(s) + " [" + (total === 0 ? count/100 : (obj[s] / total * 100).toFixed(2)) + "%]");
        }
        // return readable(list, "or");
        return list.join(", ");
    }
    
    this.manageParty = function(src, commandData) {
        var player = SESSION.users(src).rpg;
        var party;
        
        if (player.party) {
            party = this.findParty(player.party);
            
            if (party) {
                if (party.members.indexOf(src) === -1) {
                    player.party = null;
                    rpgbot.sendMessage(src, "You have been removed from a party you weren't supposed to be in!", rpgchan);
                    return;
                }
            } else {
                player.party = null;
                rpgbot.sendMessage(src, "You have been removed from a ghost party!", rpgchan);
                return;
            }
        }
        
        if (commandData === "*") {
            if (player.party) {
                party = this.findParty(player.party);
                if (party) {
                    party.viewInfo(src);
                } else {
                    player.party = null;
                    rpgbot.sendMessage(src, "You have been removed from a ghost party!", rpgchan);
                }
            } else {
                rpgbot.sendMessage(src, "You are not in any party! You can use /party create:name to make your own party!", rpgchan);
            }
            return;
        }
        
        var data = commandData.split(":");
        var action = data[0];
        var target;
        
        if (data.length > 1) {
            target = data[1];
            if (target[0] === " ") {
                target = target.substring(1);
            }
        } else {
            target = "*";
        }
        
        if (player.party) {
            party = this.findParty(player.party);
            
            if (!party) {
                player.party = null;
                rpgbot.sendMessage(src, "You have been removed from a ghost party!", rpgchan);
                return;
            }
            
            switch (action) {
                case "kick":
                case "k":
                    party.kick(src, target);
                    break;
                case "leave":
                case "l":
                    party.leave(src, false);
                    break;
                case "invite":
                case "i":
                    party.invite(src, target);
                    break;
                case "leader":
                    party.changeLeader(src, target);
                    break;
                case "disband":
                    party.destroy(src);
                    break;
                default:
                    if (party.leader === src) {
                        rpgbot.sendMessage(src, "No such action. Valid Party commands are: ", rpgchan);
                        rpgbot.sendMessage(src, "/party leave (to leave your party)", rpgchan);
                        rpgbot.sendMessage(src, "/party invite:name (to invite someone to your party)", rpgchan);
                        rpgbot.sendMessage(src, "/party kick:name (to remove someone from your party)", rpgchan);
                        rpgbot.sendMessage(src, "/party leader:name (to pass leadership of your party to another member)", rpgchan);
                        rpgbot.sendMessage(src, "/party disband (to disband your party)", rpgchan);
                    } else {
                        rpgbot.sendMessage(src, "No such action. Valid Party commands are: /party leave (to quit your current party).", rpgchan);
                    }
                    break;
            
            }
        } else {
            switch (action) {
                case "create":
                case "c":
                    if (target === "*") {
                        rpgbot.sendMessage(src, "Choose a name for your party!", rpgchan);
                        return;
                    }
                    if (this.findParty(target) !== null) {
                        rpgbot.sendMessage(src, "This name is already used!", rpgchan);
                        return;
                    }
                    currentParties.push(new Party(src, target));
                    break;
                case "join":
                case "j":
                    party = this.findParty(target);
                    if (party) {
                        party.join(src);
                    } else {
                        rpgbot.sendMessage(src, "No such party!", rpgchan);
                    }
                    break;
                default: 
                    rpgbot.sendMessage(src, "No such action! Use either '/party create:name' to make your own party or '/party join:name' to join an existing party!", rpgchan);
                    break;
            }
        }
    };
    this.findParty = function(name) {
        for (var p in currentParties) {
            if (currentParties[p].name === name) {
                return currentParties[p];
            }
        }
        return null;
    };
    
    function Party(src, data) {
        this.name = data;
        this.members = [src];
        this.invites = [];
        this.leader = src;
        
        SESSION.users(src).rpg.party = this.name;
        
        sys.sendMessage(src, "", rpgchan);
        rpgbot.sendMessage(src, "You created a party! Use '/party invite:name' to recruit members!", rpgchan);
        rpgbot.sendMessage(src, "You can also use '/party kick' to remove a member, '/party leave' to quit your party and '/party disband' to break the party!", rpgchan);
        sys.sendMessage(src, "", rpgchan);
    }
    Party.prototype.destroy = function(src) {
        if (this.isLeader(src)) {
            this.broadcast(sys.name(src) + " has disbanded the party!");
            
            for (var p = this.members.length - 1; p >= 0; --p) {
                this.leave(this.members[p], true);
            }
            
            if (currentParties.indexOf(this) !== -1) {
                currentParties.splice(currentParties.indexOf(this), 1);
            }
        }
    };
    Party.prototype.leave = function(src, silent) {
        if (this.members.indexOf(src) !== -1) {
            if (silent === false) {
                this.broadcast(sys.name(src) + " left the party!");
            }
            
            this.members.splice(this.members.indexOf(src), 1);
            SESSION.users(src).rpg.party = null;
            
            if (silent === false) {
                this.fix();
            }
        }
        if (this.invites.indexOf(src) !== -1) {
            this.invites.splice(this.invites.indexOf(src), 1);
        }
        
    };
    Party.prototype.invite = function(src, target) {
        if (this.isLeader(src)) {
            if (sys.id(target) === undefined) {
                rpgbot.sendMessage(src, "No such person!", rpgchan);
                return;
            }
            var id = sys.id(target);
            if (SESSION.users(id).rpg === undefined) {
                rpgbot.sendMessage(src, "This person doesn't have a character!", rpgchan);
                return;
            }
            if (this.members.indexOf(id) !== -1) {
                rpgbot.sendMessage(src, "This person is already a member!", rpgchan);
                return;
            }
            if (this.invites.indexOf(id) !== -1) {
                rpgbot.sendMessage(src, "You removed the invite to " + sys.name(id) + "!", rpgchan);
                this.invites.splice(this.invites.indexOf(id), 1);
                return;
            }
            if (SESSION.users(id).rpg.party) {
                rpgbot.sendMessage(src, "This person is already in another party!", rpgchan);
                return;
            }
            if (this.members.length >= battleSetup.party) {
                rpgbot.sendMessage(src, "The party is already full!", rpgchan);
                return;
            }
            this.invites.push(id);
            rpgbot.sendMessage(id, sys.name(src) + " is inviting you to a party! To join, type /party join:" + this.name, rpgchan);
            rpgbot.sendMessage(src, "You invited " + sys.name(id) + " to the party!", rpgchan);
            
        }
    };
    Party.prototype.join = function(src) {
        if (this.invites.indexOf(src) !== -1) {
            if (this.members.length >= battleSetup.party) {
                rpgbot.sendMessage(src, "The party is already full!", rpgchan);
                return;
            }
            this.invites.splice(this.invites.indexOf(src), 1);
            this.members.push(src);
            SESSION.users(src).rpg.party = this.name;
            this.broadcast(sys.name(src) + " has joined the party!");
            this.fix();
        } else {
            rpgbot.sendMessage(src, "You haven't be invited to this party!", rpgchan);
        }
    };
    Party.prototype.kick = function(src, target) {
        if (this.isLeader(src)) {
            this.fix();
            if (sys.id(target) === undefined) {
                rpgbot.sendMessage(src, "No such person!", rpgchan);
                return;
            }
            var id = sys.id(target);
            if (this.members.indexOf(id) === -1) {
                rpgbot.sendMessage(src, "This person is not in your party!", rpgchan);
                return;
            }
            if (id === src) {
                rpgbot.sendMessage(src, "You can't kick yourself! Use /party leave if you wish to leave your party!", rpgchan);
                return;
            }
            this.broadcast(sys.name(src) + " kicked " + sys.name(id) + " from the party!");
            this.leave(id, true);
        }
    };
    Party.prototype.changeLeader = function(src, target) {
        if (this.isLeader(src)) {
            if (sys.id(target) === undefined) {
                rpgbot.sendMessage(src, "No such person!", rpgchan);
                return;
            }
            var id = sys.id(target);
            if (this.members.indexOf(id) === -1) {
                rpgbot.sendMessage(src, "This person is not in your party!", rpgchan);
                return;
            }
            if (id === src) {
                rpgbot.sendMessage(src, "You are already the leader!", rpgchan);
                return;
            }
            var index = this.members.indexOf(id);
            this.members.splice(index, 1);
            this.members.splice(0, 0, id);
            this.fix();
        }
    };
    Party.prototype.updateLeader = function() {
        if (this.leader !== this.members[0]) {
            this.leader = this.members[0];
            this.broadcast(sys.name(this.leader) + " is now the leader of the party!");
        }
    };
    Party.prototype.broadcast = function(msg, exclude) {
        for (var x in this.members) {
            if (exclude && this.members[x] === exclude) {
                continue;
            }
            rpgbot.sendMessage(this.members[x], "[Party] " + msg, rpgchan);
        }
    };
    Party.prototype.viewInfo = function(src) {
        this.fix();
        
        sys.sendMessage(src, "", rpgchan);
        rpgbot.sendMessage(src, "You Party (" + this.name + "): ", rpgchan);
        for (var x = 0; x < this.members.length; ++x) {
            var player = SESSION.users(this.members[x]).rpg;
            rpgbot.sendMessage(src, player.name + (x === 0 ? " (Leader)" : "") + " [" + classes[player.job].name + ", at " + places[player.location].name + "]", rpgchan);
        }
        sys.sendMessage(src, "", rpgchan);
    };
    Party.prototype.isMember = function(src) {
        return this.members.indexOf(src) !== -1;
    };
    Party.prototype.isLeader = function(src) {
        if (this.leader === src) {
            return true;
        } else {
            rpgbot.sendMessage(src, "Only the Party Leader can use this command!", rpgchan);
            return false;
        }
    };
    Party.prototype.findMembersNear = function(src) {
        this.fix();
        
        var player = SESSION.users(src).rpg;
        var loc = player.location;
        var battlers = [];
        var viewers = [];
        
        var id;
        var target;
        for (var p in this.members) {
            id = this.members[p];
            target = SESSION.users(id).rpg;
            if (target.location === loc && target.isBattling === false && target.hp > 0) {
                battlers.push(target);
                viewers.push(id);
            }
        }
        
        return [viewers, battlers];
    };
    Party.prototype.fix = function() {
        for (var p = this.members.length - 1; p >= 0; --p) {
            if (SESSION.users(this.members[p]) === undefined || SESSION.users(this.members[p]).rpg === undefined) {
                this.members.splice(p, 1);
            }
        }
        for (p = this.invites.length - 1; p >= 0; --p) {
            if (SESSION.users(this.invites[p]) === undefined || SESSION.users(this.invites[p]).rpg === undefined) {
                this.invites.splice(p, 1);
            }
        }
        this.updateLeader();
    };
    
    
    this.startGame = function(src, commandData) {
        var user = SESSION.users(src);
        
        if (!sys.dbRegistered(sys.name(src))) {
            rpgbot.sendMessage(src, "You need to register before starting a game!", rpgchan);
            return;
        }
        if (startup.classes.indexOf(commandData.toLowerCase()) === -1) {
            rpgbot.sendMessage(src, "To create a character, type /start [class]. Possible classes are " + readable(startup.classes, "or") + ".", rpgchan);
            return;
        }
        
        var job = classes[commandData.toLowerCase()];
        user.rpg = this.createChar(job);
        
        var player = user.rpg;
        
        player.name = sys.name(src);
        player.level = 1;
        player.exp = 0;
        player.job = commandData.toLowerCase();
        
        player.statPoints = startup.stats;
        player.skillPoints = startup.skills;
        
        player.gold = startup.gold;
        player.items = {};
        for (var x in startup.items) {
            player.items[x] = startup.items[x];
        }
        
        player.plans = [];
        player.plans.push(player.strategy);
        player.plans.push(player.strategy);
        player.plans.push(player.strategy);
        
        player.equips = {
            rhand: null,
            lhand: null,
            body: null,
            head: null
        };
        
        player.id = src;
        player.location = startup.location;
        player.party = null;
        
        player.isPlayer = true;
        player.isBattling = false;
        player.version = charVersion;
        
        player.events = {};
        player.defeated = {};
        player.hunted = {};
        
        this.updateBonus(src);
        
        rpgbot.sendMessage(src, "Character successfully created!", rpgchan);
    };
    this.createChar = function(data) {
        var character = {};
        
        for (var e in data.stats) {
            character[e] = data.stats[e];
        }
        character.maxhp = character.hp;
        character.maxmp = character.mp;
        character.skills = {};
        for (e in data.skills) {
            character.skills[e] = data.skills[e];
        }
        character.strategy = {};
        for (e in data.strategy) {
            character.strategy[e] = data.strategy[e];
        }
        
        character.bonus = {
            battle: {
                str: 0,
                def: 0,
                spd: 0,
                mag: 0
            },
            equip: {
                maxhp: 0,
                maxmp: 0,
                str: 0,
                def: 0,
                spd: 0,
                mag: 0
            },
            skill: {
                maxhp: 0,
                maxmp: 0,
                str: 0,
                def: 0,
                spd: 0,
                mag: 0
            }
        };
        
        return character;
    };
    this.saveGame = function(src) {
        var user = SESSION.users(src);
        
        if (user.rpg === null) {
            rpgbot.sendMessage(src, "You have no character to save!", rpgchan);
            return;
        }
        
        // var savename = sys.name(src).toLowerCase();
        var savename = user.rpg.name.toLowerCase();
        
        if (!sys.dbRegistered(savename)) {
            rpgbot.sendMessage(src, "You need to register before saving your game!", rpgchan);
            return;
        }
        
        var savefolder = "rpgsaves";
        
        sys.makeDir(savefolder);
        sys.writeToFile(savefolder + "/" + escape(savename) + ".json", JSON.stringify(user.rpg));
        
        rpgbot.sendMessage(src, "Game saved as " + savename + "! Use /loadchar to load your progress!", rpgchan);
    };
    this.loadGame = function(src) {
        var user = SESSION.users(src);
        if (user.rpg !== undefined) {
            rpgbot.sendMessage(src, "You already have a character loaded!", rpgchan);
            return;
        }
        
        var savename = sys.name(src).toLowerCase();
        
        if (!sys.dbRegistered(savename)) {
            rpgbot.sendMessage(src, "You need to register before loading a game!", rpgchan);
            return;
        }
        
        var savefolder = "rpgsaves";
        var content = sys.getFileContent(savefolder + "/" + escape(savename) + ".json");
        if (content === undefined) {
            rpgbot.sendMessage(src, "You haven't saved a game!", rpgchan);
            return;
        }
        
        var gamefile;
        try {
            gamefile = JSON.parse(content);
        }
        catch (err) {
            rpgbot.sendMessage(src, "Your game file is corrupted. We apologise for the inconvenience...", rpgchan);
            return;
        }
        
        gamefile = this.convertChar(gamefile);
        
        user.rpg = gamefile;
        user.rpg.id = src;
        rpgbot.sendMessage(src, "You character has been loaded successfully!", rpgchan);
    };
    this.convertChar = function(gamefile) {
        var file = gamefile;
        
        var i;
        if (Array.isArray(file.items)) {
            var bag = {};
            
            for (i = 0; i < file.items.length; ++i) {
                if (!(file.items[i] in bag)) {
                    bag[file.items[i]] = 0;
                }
                bag[file.items[i]] += 1;
            }
            
            file.items = bag;
        }
        
        if (!file.events) {
            file.events = {};
        }
        
        if (!file.defeated) {
            file.defeated = {};
        }
        if (!file.hunted) {
            file.hunted = {};
        }
        if (!file.plans) {
            file.plans = [];
            file.plans.push(file.strategy);
            file.plans.push(file.strategy);
            file.plans.push(file.strategy);
        }
        
        for (i in classes[file.job].skills) {
            if (!(i in file.skills)) {
                file.skills[i] = classes[file.job].skills[i];
            }
        }
        
        
        
        return file;
    };
    this.clearChar = function(src) {
        var user = SESSION.users(src);
        
        if (user.rpg.isBattling) {
            rpgbot.sendMessage(src, "Finish this battle first!", rpgchan);
            return;
        }
        
        if (user.rpg.party && this.findParty(user.rpg.party) !== null) {
            this.findParty(user.rpg.party).leave(src);
        }
        
        user.rpg = undefined;
        
        rpgbot.sendMessage(src, "Character successfully cleared!", rpgchan);
    };
    this.resetChar = function(src) {
        var player = SESSION.users(src).rpg;
        
        if (player.isBattling) {
            rpgbot.sendMessage(src, "Finish this battle first!", rpgchan);
            return;
        }
        
        this.resetStats(src);
        this.resetSkills(src);
        
        rpgbot.sendMessage(src, "Stats/Skills reset!", rpgchan);
    };
    this.resetStats = function(src) {
        var player = SESSION.users(src).rpg;
        var data = classes[player.job];
        
        for (var e in data.stats) {
            player[e] = data.stats[e];
        }
        player.maxhp = player.hp;
        player.maxmp = player.mp;
        
        player.statPoints = startup.stats + leveling.stats * player.level;
        
        player.equips = {
            rhand: null,
            lhand: null,
            body: null,
            head: null
        };
        
        player.bonus = {
            battle: {
                str: 0,
                def: 0,
                spd: 0,
                mag: 0
            },
            equip: {
                maxhp: 0,
                maxmp: 0,
                str: 0,
                def: 0,
                spd: 0,
                mag: 0
            },
            skill: {
                maxhp: 0,
                maxmp: 0,
                str: 0,
                def: 0,
                spd: 0,
                mag: 0
            }
        };
        this.updateBonus(src);
        
    };
    this.resetSkills = function(src) {
        var player = SESSION.users(src).rpg;
        var data = classes[player.job];
        
        player.skills = {};
        for (var e in data.skills) {
            player.skills[e] = data.skills[e];
        }
        player.strategy = {};
        for (e in data.strategy) {
            player.strategy[e] = data.strategy[e];
        }
        
        player.skillPoints = startup.skills + leveling.skills * player.level;
    };
    
    this.viewStats = function(src) {
        var player = SESSION.users(src).rpg;
        
        var out = [
            "",
            "Class: " + cap(player.job),
            "Level: " + player.level,
            "Exp: " + player.exp + "/" + (player.level === expTable.length + 1 ? expTable[expTable.length-1] : expTable[player.level - 1]),
            "",
            "HP: " + player.hp + "/" + player.maxhp,
            "Mana: " + player.mp + "/" + player.maxmp,
            "",
            "Strength: " + player.str + (player.bonus.equip.str + player.bonus.skill.str !== 0 ? (player.bonus.equip.str + player.bonus.skill.str > 0 ? " +" : " ") + (player.bonus.equip.str + player.bonus.skill.str) : ""),
            "Defense: " + player.def + (player.bonus.equip.def + player.bonus.skill.def !== 0 ? (player.bonus.equip.def + player.bonus.skill.def > 0 ? " +" : " ") + (player.bonus.equip.def + player.bonus.skill.def) : ""),
            "Speed: " + player.spd + (player.bonus.equip.spd + player.bonus.skill.spd !== 0 ? (player.bonus.equip.spd + player.bonus.skill.spd > 0 ? " +" : " ") + (player.bonus.equip.spd + player.bonus.skill.spd) : ""),
            "Magic: " + player.mag + (player.bonus.equip.mag + player.bonus.skill.mag !== 0 ? (player.bonus.equip.mag + player.bonus.skill.mag > 0 ? " +" : " ") + (player.bonus.equip.mag + player.bonus.skill.mag) : ""),
            "",
            "Gold: " + player.gold,
            "",
            "Stat Points: " + player.statPoints,
            "",
            "Type /skills to find information about your skills!"
        ];
        
        for (var x in out) {
            sys.sendMessage(src, out[x], rpgchan);
        }
    };
    this.viewSkills = function(src) {
        var player = SESSION.users(src).rpg;
        
        var out = ["", "Skills: "];
        for (var s in player.skills) {
            out.push(skills[s].name + " (" + s + ") : [" + player.skills[s] + "/" + skills[s].levels + "] " + skills[s].info + " (" + skills[s].cost + " Mana)");
        }
        out.push("");
        out.push("Skill Points: " + player.skillPoints)
        out.push("");
        out.push("Type /stats to find information about your stats!");
        
        for (var x in out) {
            sys.sendMessage(src, out[x], rpgchan);
        }
    };
    this.viewPlaces = function(src) {
        var out = [""];
        var sk;
        for (var s in places) {
            sk = places[s];
            out.push(sk.name + " (" + s + "): " + sk.info);
        }
        out.push("");
        
        for (var x in out) {
            sys.sendMessage(src, out[x], rpgchan);
        }
    };
    this.showCommands = function(src, commandData) {
        sys.sendMessage(src, "", rpgchan);
        var x;
		if (commandData.toLowerCase() !== "auth"){
            if (commandData.toLowerCase() === "hidden") {
                sys.sendMessage(src, "Alternative Commands:", rpgchan);
                for (x in this.commands.altactions) {
                    sys.sendMessage(src, "/" + x + " - " + this.commands.altactions[x][1], rpgchan);
                }
            } else {
                sys.sendMessage(src, "Actions:", rpgchan);
                for (x in this.commands.actions) {
                    sys.sendMessage(src, "/" + x + " - " + this.commands.actions[x][1], rpgchan);
                }
                sys.sendMessage(src, "Character commands:", rpgchan);
                for (x in this.commands.character) {
                    sys.sendMessage(src, "/" + x + " - " + this.commands.character[x][1], rpgchan);
                }
                sys.sendMessage(src, "Channel commands:", rpgchan);
                for (x in this.commands.channel) {
                    sys.sendMessage(src, "/" + x + " - " + this.commands.channel[x][1], rpgchan);
                }
            }
		} else {
			if (isRPGAdmin(src)) {
				sys.sendMessage(src, "Operator Commands:", rpgchan);
				for (x in this.commands.op) {
					sys.sendMessage(src, "/" + x + " - " + this.commands.op[x][1], rpgchan);
				}
			}
			if (SESSION.channels(rpgchan).masters.indexOf(sys.name(src).toLowerCase()) !== -1) {
				sys.sendMessage(src, "Owner Commands:", rpgchan);
				for (x in this.commands.master) {
					sys.sendMessage(src, "/" + x + " - " + this.commands.master[x][1], rpgchan);
				}
			}
		}
        sys.sendMessage(src, "", rpgchan);
    };
    this.showHelp = function(src) {
		var help = [
			"",
			"*** *********************************************************************** ***",
			"±RPG: Welcome! This is RPG, use /commands to find commands and /start to create a new character! Don't forget to /savechar",
			"*** *********************************************************************** ***",
			""
		];
		for (var x in help) {
           sys.sendMessage(src, help[x], rpgchan);
        }
	};
    
    function runUpdate() {
        var tempBattles = currentBattles;
        var tempDuels = duelChallenges;
        var tempTrades = tradeRequests;
        var tempParty = currentParties;
        
        var POglobal = SESSION.global();
        var index, source;
        for (var i = 0; i < POglobal.plugins.length; ++i) {
            if ("rpg.js" === POglobal.plugins[i].source) {
                source = POglobal.plugins[i].source;
                index = i;
            }
        }
        if (index !== undefined) {
            updateModule(source, function (module) {
                POglobal.plugins[index] = module;
                module.source = source;
                module.init();
                // sendChanAll("Update complete!", rpgchan);
                module.game.restoreValues(tempBattles, tempDuels, tempTrades, tempParty);
                
            });
            sendChanAll("Updating RPG game...", rpgchan);
        }
        return;
    }
    this.loadInfo = function() {
    	try {
            sys.webCall(contenturl, function (content) {
                var parsed = JSON.parse(content);
            
                classes = parsed.classes;
                monsters = parsed.monsters;
                skills = parsed.skills;
                items = parsed.items;
                places = parsed.places;
                expTable = parsed.config.levels;
                elements = parsed.config.elements || {};
                
                if (parsed.config.battle) {
                    var battle = parsed.config.battle;
                    if (battle.evasion) {
                        battleSetup.evasion = battle.evasion / 100;
                    }
                    if (battle.defense) {
                        battleSetup.defense = battle.defense;
                    }
                    if (battle.damage) {
                        battleSetup.damage = battle.damage;
                    }
                    if (battle.critical) {
                        battleSetup.critical = battle.critical;
                    }
                    if (battle.party) {
                        battleSetup.party = battle.party;
                    }
                }
                
                startup.classes = parsed.config.startup.classes;
                startup.location = parsed.config.startup.location;
                startup.gold = parsed.config.startup.gold;
                startup.items = parsed.config.startup.items;
                startup.stats = parsed.config.startup.stats;
                startup.skills = parsed.config.startup.skills;
                
                if (parsed.config.leveling) {
                    var level = parsed.config.leveling;
                    if (level.hp) {
                        leveling.hp = level.hp;
                    }
                    if (level.mp) {
                        leveling.mp = level.mp;
                    }
                    if (level.stats) {
                        leveling.stats = level.stats;
                    }
                    if (level.skills) {
                        leveling.skills = level.skills;
                    }
                    if (level.skillFromOtherClass) {
                        leveling.skillFromOtherClass = level.skillFromOtherClass;
                    }
                }
                
                if (parsed.config.equipment) {
                    equipment = parsed.config.equipment;
                }
                
                var e, n, alt;
                altSkills = {};
                for (e in skills) {
                    if ("alt" in skills[e]) {
                        for (n = 0; n < skills[e].alt.length; ++n) {
                            alt = skills[e].alt[n];
                            altSkills[alt] = e;
                        }
                    }
                }
                altPlaces = {};
                for (e in places) {
                    if ("alt" in places[e]) {
                        for (n = 0; n < places[e].alt.length; ++n) {
                            alt = places[e].alt[n];
                            altPlaces[alt] = e;
                        }
                    }
                }
                altItems = {};
                for (e in items) {
                    if ("alt" in items[e]) {
                        for (n = 0; n < items[e].alt.length; ++n) {
                            alt = items[e].alt[n];
                            altItems[alt] = e;
                        }
                    }
                }
            });
		} catch (err) {
			sys.sendAll("Error loading RPG Game data: " + err, rpgchan);
		}
	};
    this.restoreValues = function(tempBattles, tempDuels, tempTrades, tempParty) {
        tradeRequests = tempTrades;
        currentBattles = tempBattles;
        duelChallenges = tempDuels;
        currentParties = tempParty;
    };
    this.callUpdate = function (src) {
        runUpdate();
        return;
    };

	this.commands = {
		actions: {
            walk: [this.changeLocation, "To go to a different location."],
            talk: [this.talkTo, "To talk to an NPC."],
            explore: [this.exploreLocation, "To explore a location for items or monsters."],
            flee: [this.fleeBattle, "To run away from your current battle."],
            item: [this.useItem, "To use or view your items."],
            challenge: [this.challengePlayer, "To challenge another player to a duel."],
            revive: [this.reviveSelf, "To respawn after you die."],
            trade: [this.requestTrade, "To request a trade with another player."]
		},
        character: {
            plan: [this.setBattlePlan, "To see or set your battle strategy."],
            stats: [this.viewStats, "To view your character status."],
            skills: [this.viewSkills, "To view the available skills."],
            increase: [this.addPoint, "To increase your stats or skills after you level up."],
            //resetchar: [this.resetChar, "To reset your build without erasing your character."],
            savechar: [this.saveGame, "To save your progress."],
            clearchar: [this.clearChar, "To clear your character."],
            //inn: [this.gotoInn, "Pay 10 Gold to fully restore HP and MP."],
            party: [this.manageParty, "To create and manage a party"]
        },
        altactions: {
            skill: [this.viewSkills, "Same as /skills."],
            items: [this.useItem, "Same as /item."],
            e: [this.exploreLocation, "Same as /explore."],
            w: [this.changeLocation, "Same as /walk."],
            t: [this.talkTo, "Same as /talk."],
            r: [this.reviveSelf, "Same as /revive."],
            i: [this.useItem, "Same as /item."],
            f: [this.fleeBattle, "Same as /flee"],
            c: [this.challengePlayer, "Same as /challenge."],
            p: [this.manageParty, "Same as /party."]
        },
		channel: {
			help: [this.showHelp, "To learn how to play the game."],
			commands: [this.showCommands, "To see the list of commands."],
            start: [this.startGame, "To create your character and begin your game."],
            loadchar: [this.loadGame, "To load your previously saved game."],
            places: [this.viewPlaces, "To view the available locations."]
		},
		op: {
			
		},
		master: {
			updaterpg: [this.callUpdate, "Update the RPG Channel."]
		}
	};
    this.handleCommand = function(src, message, channel) {
        if (channel !== rpgchan) {
            return;
        }
        try {
			game.handleCommandOld(src, message, channel);
            return true;
        } catch(e) {
            if (e !== "No valid command") {
                sys.sendAll("Error on RPG command: " + e, rpgchan);
                return true;
            }
        }
    };
    this.handleCommandOld = function(src, message, channel) {
		var command;
		var commandData = '*';
		var pos = message.indexOf(' ');
		if (pos !== -1) {
			command = message.substring(0, pos).toLowerCase();
			commandData = message.substr(pos+1);
		} else {
			command = message.substr(0).toLowerCase();
		}
        
		if (command in this.commands.channel) {
			this.commands.channel[command][0].call(this, src, commandData);
			return true;
		}
		if (command in this.commands.actions) {
			if (SESSION.users(src).rpg === undefined) {
                rpgbot.sendMessage(src, "You need to start the game to use this command!", rpgchan);
                return true;
            }
            this.commands.actions[command][0].call(this, src, commandData);
			return true;
		}
        if (command in this.commands.altactions) {
			if (SESSION.users(src).rpg === undefined) {
                rpgbot.sendMessage(src, "You need to start the game to use this command!", rpgchan);
                return true;
            }
            this.commands.altactions[command][0].call(this, src, commandData);
			return true;
		}
        if (command in this.commands.character) {
			if (SESSION.users(src).rpg === undefined) {
                rpgbot.sendMessage(src, "You need to start the game to use this command!", rpgchan);
                return true;
            }
            this.commands.character[command][0].call(this, src, commandData);
			return true;
		}

		if (!isRPGAdmin(src)) {
			throw ("No valid command");
		}

		if (command in this.commands.op) {
			this.commands.op[command][0].call(this, src, commandData);
			return true;
		}

		if (SESSION.channels(rpgchan).masters.indexOf(sys.name(src).toLowerCase()) === -1) {
			throw ("No valid command");
		}

		if (command in this.commands.master) {
			this.commands.master[command][0].call(this, src, commandData);
			return true;
		}

		throw ("No valid command");
	};
    this.tickDown = function() {
        tick++;
        if (tick % 3 === 0) {
            for (var x in currentBattles) {
                currentBattles[x].playNextTurn();
            }
            tick = 0;
        }
	};
    this.removePlayer = function(src)  {
        var player = SESSION.users(src).rpg;
            
        this.quitBattle(src);
        for (var p in currentParties) {
            currentParties[p].leave(src, false);
        }
        if (player.name in tradeRequests) {
            tradeRequests[player.name] = undefined;
        }
        if (player.name in duelChallenges) {
            duelChallenges[player.name] = undefined;
        }
    };
	this.beforeLogOut = function(src) {
        if (SESSION.users(src).rpg !== undefined) {
            game.removePlayer(src);
        }
    };
	this.init = function() {
		var name="RPG";
		if (sys.existChannel(name)) {
            rpgchan = sys.channelId(name);
        } else {
            rpgchan = sys.createChannel(name);
        }
        SESSION.global().channelManager.restoreSettings(rpgchan);
        SESSION.channels(rpgchan).perm = true;
        SESSION.channels(rpgchan).master = "Kase";
		game.loadInfo();
        rpgbot.sendAll("RPG Game was reloaded!", rpgchan);
	};
	this.stepEvent = function() {
        try {
            game.tickDown();
        } catch(err) {
            sys.sendAll("±RPGBot: error occurred: " + err, rpgchan);
        }
    };

	function isRPGAdmin(src) {
		if (sys.auth(src) >= 1) {
            return true;
        }
        var name = sys.name(src).toLowerCase();
        if (SESSION.channels(rpgchan).operators.indexOf(name) !== -1 || SESSION.channels(rpgchan).admins.indexOf(name) !== -1 || SESSION.channels(rpgchan).masters.indexOf(name) !== -1) {
            return true;
        }
        return false;
	}
    function randomElement(arr) {
		return arr[sys.rand(0, arr.length)];
	}
    function cap(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    function shuffle(o) {
        for (var j, x, i = o.length; i; j = parseInt(Math.random() * i, 10), x = o[--i], o[i] = o[j], o[j] = x);
        return o;
    }
    function readable(arr, last_delim) {
        if (!Array.isArray(arr)) {
            return arr;
        }
        if (arr.length > 1) {
            return arr.slice(0, arr.length - 1).join(", ") + " " + last_delim + " " + arr.slice(-1)[0];
        } else if (arr.length === 1) {
            return arr[0];
        } else {
            return "";
        }
    }
    function randomSample(hash) {
        var cum = 0;
        var val = Math.random();
        var psum = 0.0;
        var x;
        var count = 0;
        for (x in hash) {
            psum += hash[x];
            count += 1;
        }
        if (psum === 0.0) {
            var j = 0;
            for (x in hash) {
                cum = (++j) / count;
                if (cum >= val) {
                    return x;
                }
            }
        } else {
            for (x in hash) {
                cum += hash[x] / psum;
                if (cum >= val) {
                    return x;
                }
            }
        }
    }
}

module.exports = function() {
	var id;
    var init = function() {
		var name = "RPG";
		if (sys.existChannel(name)) {
			id = sys.channelId(name);
		} else {
			id = sys.createChannel(name);
		}
		SESSION.global().channelManager.restoreSettings(id);
		SESSION.channels(id).perm = true;
		SESSION.channels(id).master = "RiceKirby";
	};

	var game = new RPG(id);

	return {
		game: game,
		init: game.init,
		// beforeChatMessage: game.beforeChatMessage,
		handleCommand: game.handleCommand,
        // beforeChannelJoin: game.beforeChannelJoin,
        beforeLogOut: game.beforeLogOut,
		stepEvent: game.stepEvent
	};
}();
