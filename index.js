'use strict'
const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

const width = 500
const height = 500
const maxShieldTime = 3000;
var PrimaryPlayerId = 0
const MoveEnum = {
    FALSE :0,
    LEFT:0x0001,
    UP:0x0010,
    RIGHT:0x0100,
    DOWN:0x1000
}
const maxBombSize = 100;
const bombTime = 10000;
let scorePoints = []

class Player{
    constructor(id,socketId,x,y,score){
        this.id = id;
        this.socketId = socketId
        this.x = x
        this.y = y
        this.move = MoveEnum.FALSE
        this.score = 0
        this.shield = false
        this.breakShield = false;
        this.shieldTime = maxShieldTime;
        this.speed = 0.2;
        this.size = 10;
        this.blocedkBy = 0;
        this.slaves = [];
        this.bombTime = 0;
        this.shieldSize = this.size*5;
        this.color = [ Math.floor(Math.random()*255),
            Math.floor(Math.random()*255),
            Math.floor(Math.random()*255)]
    }
}

/** @type {Player[]} */
const players = [];
const playersObjectById = {};
const bombs = [];
function getPlayersData(){
    let result = [];
    players.forEach(p=>{
        if(p.socketId){
            result.push(p.id)
            result.push(p.x)
            result.push(p.y)
            result.push(p.shield)
            result.push(p.color)
            result.push(p.score)
            result.push(p.shieldTime)
            result.push(p.size)
            result.push(p.shieldSize)
            result.push(p.bombTime>0?false:true)
        }
    })
    result.push([scorePoints[0]?scorePoints[0].x:-1,scorePoints[0]?scorePoints[0].y:-1])
    result.push(bombs)
    return result;
}

app.get('/', (req, res) => {
    console
  res.sendFile(join(__dirname, 'circle.html'));
});

io.on('connection', (socket) => {
  console.log('a user connected');
  
  socket.on('ready',pid=>{
    console.log(pid)
    let player;
    if(pid){
        players.forEach(p=>{
            if(p.id == pid){
                player = p
                player.socketId = socket.id;
                socket.player = player;
            }
        })
    }
    if(!player){
        PrimaryPlayerId++
        player = new Player(PrimaryPlayerId,socket.id,0,0,0)
        players.push(player)
        playersObjectById[player.id] = player
        socket.player = player
    }
    socket.emit("ready",player.id)
  })

  socket.on("move",moveData=>{
    if(!socket.player)return
    socket.player.move = moveData
  })

  socket.on("shield",data=>{
    onShield(socket,data)
  })

  socket.on("rotate",data=>{
    if(!socket.player)return;
    // onShield(socket,true);
    if(socket.player.shield && socket.player.slaves.length){
        socket.player.slaves.forEach(p=>{
            let t = playersObjectById[p]
            rotate(socket.player,t,data)
        })
    }
  })

  socket.on('bomb',()=>{
    console.log('bomb')
    if(!socket.player)return;
    if(socket.player.bombTime==0){
        console.log("BOMBED")
        socket.player.bombTime=bombTime;
        let x= socket.player.x
        let y = socket.player.y
        setTimeout(()=>{
            bombs.push([x,y,0])
        },100)
    }
  })

  socket.on("disconnect",()=>{
    let playerId;
      if(socket.player){
        socket.player.socketId = "";
        playerId = socket.player.id;
    }
    setTimeout(()=>{
        if(!playerId) return;
        let player;
        players.forEach(p=>{
            if(p.id==playerId && !p.socketId){
                player=p
            }
            if(player){
                players.splice(players.indexOf(player),1)
                delete playersObjectById[playerId]
            }
        })
    },3000)
  })
});

function onShield(socket,data){
    if(!socket.player)return;
    let player = socket.player
    if(data && !player.blocedkBy && !player.breakShield){
        if(player.shieldTime<maxShieldTime){
            player.shieldTime-=1500
        }else{
            player.shieldTime-=200
        }
        socket.player.shield = true
    }else if (!data){
        socket.player.shield = false
    }
}
let lastTime = Date.now()
setInterval(()=>{
    let now = Date.now()
    let deltaTime = now-lastTime;
    lastTime = now;
    update(deltaTime)
    io.emit("m",getPlayersData())
},1000/50)

server.listen(8000, () => {
  console.log('server running at http://localhost:8000');
});

function update(deltaTime){
    shieldTimerHandler(deltaTime)
    moveHandler(deltaTime)
    scorePointsHandler()
    bombHandler(deltaTime)
}

function bombHandler(dt){
    bombs.forEach(bomb=>{
        if(bomb){
            players.forEach(p=>{
                if(distance(p,{x: bomb[0],y:bomb[1]})<p.size+bomb[2] ){
                    bombs.splice(bombs.indexOf(bomb),1);
                    p.size = 10;
                    p.shieldSize = 50;
                }
            })
        }
    })
    bombs.forEach(bomb=>{
        if(bomb){
            if(bomb[2]==maxBombSize){
                bombs.splice(bombs.indexOf(bomb),1);
            }else{
                bomb[2] = Math.min(maxBombSize,bomb[2]+dt/100)
            }
        }
    })
    players.forEach(p=>{
        if(p.bombTime)
        p.bombTime =Math.max(0,p.bombTime-dt)
    })
}

function scorePointsHandler(){
    if(!scorePoints.length){
        let x = Math.floor(Math.random()*width)
        let y = Math.floor(Math.random()*height)
        if(x<10){x = 10}
        if(y<10){y = 10}
        if(x>width){x = width-10}
        if(y>height){y = height-10}
        scorePoints.push({
            x: x,
            y: y
        })
    }
    players.forEach(p=>{
        if(scorePoints.length){
            let d = distance(p,scorePoints[0]);
            if(d<=p.size*1.5){
                p.score++;
                if(p.size<100){
                    p.size++;
                    p.shieldSize = Math.min(p.size+50,p.size*5)
                    scorePoints.splice(0,1)
                }
            }
        }
    })
}

function shieldTimerHandler(dt){
    players.forEach(p=>{
        if(!p.shield){
            p.shieldTime = Math.min(p.shieldTime+dt, maxShieldTime)
        }else{
            p.shieldTime = Math.max(p.shieldTime-dt, 0)
        }
        if(p.shieldTime==0){
            p.breakShield = true;
            p.shield = false;
        }
        if(p.shieldTime==maxShieldTime){
            p.breakShield = false;
        }
    })
    players.forEach(p=>{
        if(p.shield){
            players.forEach(t=>{
                if(t.id!=p.id && !t.blocedkBy && distance(p,t)<p.shieldSize){
                    t.blocedkBy = p.id;
                    p.slaves.push(t.id)
                    t.move = 0;
                }
            })
        }
    })
    players.forEach(p=>{
        if(p.blocedkBy){
            players.forEach(m=>{
                if(p.id != m.id && m.id==p.blocedkBy){
                    if(distance(p,m)>=m.shieldSize || !m.shield){
                        p.blocedkBy=0;
                        m.slaves.splice(m.slaves.indexOf(p.id),1)
                    }
                }
            })
        }
    })
}

function distance(p,t){
    return Math.sqrt(Math.pow(t.x-p.x,2) + Math.pow(t.y-p.y,2) ) 
}

function moveHandler(dt){
    players.forEach(p=>{
        let direction = {x:0,y:0};
        if(p.move!=MoveEnum.FALSE){
            if(p.move &  MoveEnum.LEFT){
                direction.x = -1;
            }
            if(p.move &  MoveEnum.UP){
                direction.y = -1;
            }
            if(p.move &  MoveEnum.DOWN){
                direction.y = 1;
            }
            if(p.move &  MoveEnum.RIGHT){
                direction.x = 1;
            }
        }
        let speed = p.blocedkBy?p.speed/5:p.speed;
        p.x += direction.x*speed*dt;
        p.y += direction.y*speed*dt;
        if(p.x<0)p.x=0;
        if(p.y<0)p.y=0;
        if(p.x>width)p.x=width;
        if(p.y>height)p.y=height;
    })
}


function rotate(p,t,dir){
    let radians = (10 * Math.PI) / 180;
    if(!dir) radians *= -1;
    const cosTheta = Math.cos(radians);
    const sinTheta = Math.sin(radians);

    const translatedX = t.x - p.x;
    const translatedY = t.y - p.y;

    const rotatedX = translatedX * cosTheta - translatedY * sinTheta;
    const rotatedY = translatedX * sinTheta + translatedY * cosTheta;

    t.x = rotatedX + p.x;
    t.y = rotatedY + p.y;
}