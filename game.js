const COLORS=['Red','Blue','Green','Yellow','Pink','Black'];
const IMG={Red:'assets/red.png',Blue:'assets/blue.png',Green:'assets/green.png',Yellow:'assets/yellow.png',Pink:'assets/pink.png',Black:'assets/black.png'};
const BACK='assets/back.png';
const PLAYER=0, OPP=1;
let game=null, localSeat=PLAYER, mode='solo', peer=null, conn=null, isHost=false, muted=false, bgAudio=null, popupHidden=false;
let rematchRequested={0:false,1:false};
const $=id=>document.getElementById(id);
function log(t){const d=document.createElement('div');d.className='logItem';d.textContent=t;$('log').appendChild(d)}
function status(t){$('status').textContent=t}
function snd(name){if(muted)return; try{let a=new Audio(name);a.volume=.55;a.play().catch(()=>{})}catch{}}
function bg(){startBg()}
function startBg(){if(muted)return; try{if(!bgAudio){bgAudio=new Audio('sounds/bg.mp3');bgAudio.loop=true;bgAudio.volume=.18}bgAudio.play().catch(()=>{})}catch{}}
function setMuted(v){muted=v;if(bgAudio){if(muted)bgAudio.pause();else startBg()}$('muteBtn').textContent=muted?'Sound: Off':'Sound: On'}
function uid(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function copy(o){return JSON.parse(JSON.stringify(o))}
function p(i){return game.players[i]}
function opp(i){return i===0?1:0}
function img(c){return IMG[c.color||c]}
function makeDeck(owner){let deck=[];let n=0;COLORS.forEach(color=>{for(let i=0;i<10;i++)deck.push({id:owner+'-'+color+'-'+(n++),color,owner,trapped:[]})});for(let i=deck.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}return deck}
function newState(){return {players:[{name:'You',deck:makeDeck(0),hand:[],field:[],discard:[],removed:[]},{name:mode==='solo'?'Warren Bot':'Opponent',deck:makeDeck(1),hand:[],field:[],discard:[],removed:[]}],current:0,firstTurn:true,actionUsed:false,pending:null,over:false,winner:null,winReason:'',triggerQueue:[]}}
function draw(player,n=1,announce=true){for(let i=0;i<n;i++){let c=p(player).deck.pop(); if(c)p(player).hand.push(c)} if(announce){log(`${p(player).name} draws ${n}.`);snd('sounds/draw.mp3')}}
function startGame(){game=newState();draw(0,3,false);draw(1,3,false);rematchRequested={0:false,1:false};log(mode==='solo'?'New solo game started.':'Online game started.');snd('sounds/shuffle.mp3');status(localSeat===0?'Your turn.':'Waiting for opponent.');render();sync();if(mode==='solo'&&localSeat===0)autoEndCheck()}
function hostOnline(){startBg();if(!window.Peer){alert('PeerJS did not load. Check internet connection.');return}cleanupPeer();mode='online';isHost=true;localSeat=0;const code='CC'+Math.random().toString(36).slice(2,6).toUpperCase();$('onlinePanel').classList.remove('hidden');$('roomCode').textContent=code;$('onlineState').textContent='Waiting for player...';peer=new Peer(code);peer.on('open',id=>{status('Give this code to the other player: '+id)});peer.on('connection',c=>{conn=c;setupConn();$('onlineState').textContent='Player connected. Starting game.';startGame()});peer.on('error',e=>{status('Online error: '+e.type);log('Online error: '+e.message)})}
function joinOnline(){startBg();if(!window.Peer){alert('PeerJS did not load. Check internet connection.');return}let code=$('joinCode').value.trim().toUpperCase();if(!code)return alert('Enter the host code.');cleanupPeer();mode='online';isHost=false;localSeat=1;$('onlinePanel').classList.remove('hidden');$('roomCode').textContent=code;$('onlineState').textContent='Connecting...';peer=new Peer();peer.on('open',()=>{conn=peer.connect(code,{reliable:true});setupConn()});peer.on('error',e=>{status('Online error: '+e.type);log('Online error: '+e.message)})}
function setupConn(){conn.on('open',()=>{$('onlineState').textContent='Connected';status(isHost?'Opponent joined.':'Connected. Waiting for host.');if(conn.send)conn.send({type:'hello'})});conn.on('data',msg=>{if(msg.type==='state'){game=msg.game;render()}else if(msg.type==='move'&&isHost){handleMove(msg.move,1)}else if(msg.type==='rematch'&&isHost){rematchRequested[msg.player]=true;log('Opponent requested a rematch.');if(rematchRequested[0]&&rematchRequested[1])startGame();else sync()}else if(msg.type==='rematchHost'){rematchRequested=msg.rematchRequested||rematchRequested;render()}else if(msg.type==='hello'&&isHost&&game)sync()});conn.on('close',()=>{$('onlineState').textContent='Disconnected';status('Online opponent disconnected.')})}
function cleanupPeer(){try{if(conn)conn.close();if(peer)peer.destroy()}catch{} conn=null;peer=null;isHost=false}
function sync(){if(mode==='online'&&isHost&&conn&&conn.open){conn.send({type:'state',game});conn.send({type:'rematchHost',rematchRequested})}}
function sendMove(move){if(mode==='online'&&!isHost){conn?.send({type:'move',move});return}handleMove(move,localSeat)}
function handleMove(move,seat){if(!game||game.over)return;if(move.action==='play')playCard(seat,move.index,move.kind);if(move.action==='passReaction')passReaction(seat);if(move.action==='blueReaction')blueReaction(seat,move.blueIndex,move.extraIndex);if(move.action==='blackReaction')blackReaction(seat,move.blackIndex);if(move.action==='target')chooseTarget(seat,move.targetType,move.index);if(move.action==='endTurn')endTurn(seat);render();sync();scheduleAutoProgress()}
function canAct(seat){return game&&game.current===seat&&!game.actionUsed&&!game.pending&&!game.over}
function cardCanDiscard(c){return ['Red','Green','Black'].includes(c.color)}
function hasReaction(seat){let h=p(seat).hand;return h.some(c=>c.color==='Black')||(h.some(c=>c.color==='Blue')&&h.length>=2)}
function stackTop(){if(!game.pending||game.pending.type!=='stack')return null;let st=game.pending.stack;return st[st.length-1]||null}
function pendingCard(){let top=stackTop();if(!top||top.kind!=='field')return null;let idx=fieldCardById(top.player,top.cardId);return idx>=0?p(top.player).field[idx]:null}
function setReactionStack(action){game.pending={type:'stack',stack:[action],reactFor:opp(action.player)};status(`${p(opp(action.player)).name} may react.`)}
function playCard(seat,index,kind){
  if(!canAct(seat))return;
  let hand=p(seat).hand;
  if(index<0||index>=hand.length)return;
  let card=hand[index];
  if(kind==='discard'){
    if(!cardCanDiscard(card))return;
    hand.splice(index,1);
    p(seat).discard.push(card);
    log(`${p(seat).name} uses ${card.color} Discard Action.`);
    resolveDiscard(seat,card);
    // If the discard action did not create a target choice, the action is done.
    if(!game.pending)finishAction(seat);
    return;
  }
  hand.splice(index,1);
  p(seat).field.push(card);
  log(`${p(seat).name} adds ${card.color} to field.`);
  setReactionStack({kind:'field',player:seat,cardId:card.id,color:card.color});
  // In solo, the bot immediately gets a chance to answer your play. If it does not react, it passes.
  if(mode==='solo'&&seat===PLAYER)setTimeout(()=>{botReactOrPass();render();scheduleAutoProgress()},450);
}
function fieldCardById(player,id){return p(player).field.findIndex(c=>c.id===id)}

function queueReturnedTrap(owner,card){
  if(!card)return;
  card.trapped=card.trapped||[];
  p(owner).field.push(card);
  game.triggerQueue=game.triggerQueue||[];
  game.triggerQueue.push({player:owner,cardId:card.id,color:card.color});
  log(`${p(owner).name}'s trapped ${card.color} returns to play and will retrigger.`);
}
function releaseTrappedFrom(card){
  if(!card||!card.trapped||!card.trapped.length)return;
  let trapped=card.trapped.splice(0);
  trapped.forEach(tc=>queueReturnedTrap(tc.owner,tc));
}
function removeFieldCard(player,index,dest){
  if(index<0||index>=p(player).field.length)return null;
  let c=p(player).field.splice(index,1)[0];
  releaseTrappedFrom(c);
  if(dest==='discard')p(player).discard.push(c);
  else if(dest==='hand')p(player).hand.push(c);
  else if(dest==='removed')p(player).removed.push(c);
  return c;
}
function processTriggerQueue(){
  if(!game||game.pending)return;
  game.triggerQueue=game.triggerQueue||[];
  while(game.triggerQueue.length&&!game.pending){
    let t=game.triggerQueue.shift();
    let idx=fieldCardById(t.player,t.cardId);
    if(idx>=0){
      let card=p(t.player).field[idx];
      log(`${p(t.player).name}'s returned ${card.color} retriggers.`);
      resolveField(t.player,card);
    }
  }
}
function passReaction(seat){if(!game.pending||game.pending.type!=='stack'||game.pending.reactFor!==seat)return;let st=game.pending.stack;let top=st.pop();if(!top){game.pending=null;return}resolveStackAction(top,st);if(game.pending&&game.pending.type==='stack'){if(st.length){let next=st[st.length-1];game.pending.reactFor=opp(next.player);log(`${p(game.pending.reactFor).name} may react to ${next.kind==='field'?next.color+' card':'the reaction'} again.`)}else{let acting=game.current;game.pending=null;processTriggerQueue();if(!game.pending)finishAction(acting)}}}
function blueReaction(seat,blueIndex,extraIndex){if(!game.pending||game.pending.type!=='stack'||game.pending.reactFor!==seat)return;let hand=p(seat).hand;if(!hand[blueIndex]||hand[blueIndex].color!=='Blue'||hand.length<2)return;let blue=hand.splice(blueIndex,1)[0];if(extraIndex>blueIndex)extraIndex--;if(extraIndex<0||extraIndex>=hand.length){p(seat).hand.push(blue);return}let extra=hand.splice(extraIndex,1)[0];p(seat).discard.push(blue,extra);game.pending.stack.push({kind:'blueReaction',player:seat,color:'Blue'});game.pending.reactFor=opp(seat);log(`${p(seat).name} plays Blue Reaction from hand, discarding Blue and ${extra.color}. ${p(opp(seat)).name} may react to the reaction.`);snd('sounds/react.mp3')}
function blackReaction(seat,blackIndex){if(!game.pending||game.pending.type!=='stack'||game.pending.reactFor!==seat)return;let hand=p(seat).hand;if(!hand[blackIndex]||hand[blackIndex].color!=='Black')return;let black=hand.splice(blackIndex,1)[0];p(seat).discard.push(black);game.pending.stack.push({kind:'blackReaction',player:seat,color:'Black'});game.pending.reactFor=opp(seat);log(`${p(seat).name} plays Black Reaction from hand. ${p(opp(seat)).name} may react to the reaction.`);snd('sounds/react.mp3')}
function resolveStackAction(action,st){
  if(action.kind==='field'){
    let idx=fieldCardById(action.player,action.cardId);let card=idx>=0?p(action.player).field[idx]:null;
    if(card){log(`${action.color} resolves.`);resolveField(action.player,card)}
    return;
  }
  let target=st.pop();
  if(!target){log(`${action.color} Reaction resolves, but there is no card left to counter.`);return;}
  if(target.kind==='field'){
    let idx=fieldCardById(target.player,target.cardId);
    if(idx>=0){
      let card=removeFieldCard(target.player,idx,action.kind==='blueReaction'?'discard':'hand');
      if(action.kind==='blueReaction'){log(`${p(action.player).name}'s Blue Reaction counters ${p(target.player).name}'s ${card.color}; it goes to discard.`)}
      else{log(`${p(action.player).name}'s Black Reaction counters ${p(target.player).name}'s ${card.color}; it returns to hand.`)}
      processTriggerQueue();
    }
  }else{
    log(`${p(action.player).name}'s ${action.color} Reaction counters ${p(target.player).name}'s ${target.color} Reaction. The countered reaction ability does not happen.`)
  }
}
function resolveField(seat,card){
  let enemy=opp(seat);
  if(card.color==='Blue'){
    draw(seat,1);
    return;
  }
  if(card.color==='Green'){
    if(p(seat).discard.length){
      game.pending={type:'target',player:seat,targetType:'greenReturn'};
      status(`${p(seat).name} chooses a discard card to return to hand.`);
    }else{
      log(`${p(seat).name} has no discard cards for Green to return.`);
    }
    return;
  }
  if(card.color==='Red'){
    if(p(enemy).field.length){game.pending={type:'target',player:seat,targetType:'redRemove'};status(`${p(seat).name} chooses a card to remove.`)}
    return;
  }
  if(card.color==='Pink'){
    if(p(enemy).hand.length){
      game.pending={type:'target',player:seat,targetType:'pinkHandDiscard'};
      status(`${p(seat).name} looks at ${p(enemy).name}'s hand and chooses a card to discard.`);
    }else if(p(enemy).discard.length){
      game.pending={type:'target',player:seat,targetType:'pinkRemoveDiscard'};
      status(`${p(seat).name} chooses cards from ${p(enemy).name}'s discard pile to remove from the game.`);
    }else{
      log(`${p(seat).name} uses Pink, but there is no hand card or discard card to choose.`);
    }
    return;
  }
  if(card.color==='Yellow'){
    // Yellow has two field choices:
    // 1) retrigger one of your non-Black cards already in play, OR
    // 2) trap one opponent field card under this Yellow.
    let canTrap=p(enemy).field.length>0;
    let canRetrigger=p(seat).field.some(c=>c.color!=='Black');
    if(canTrap&&canRetrigger){
      game.pending={type:'target',player:seat,targetType:'yellowMode',cardId:card.id};
      status(`${p(seat).name} chooses Yellow: trap a card or retrigger one of their non-Black field cards.`);
      snd('sounds/trap.mp3');
    }else if(canTrap){
      game.pending={type:'target',player:seat,targetType:'yellowTrap',cardId:card.id};
      status(`${p(seat).name} chooses an opponent card to trap under Yellow.`);
      snd('sounds/trap.mp3');
    }else if(canRetrigger){
      game.pending={type:'target',player:seat,targetType:'yellowRetrigger',cardId:card.id};
      status(`${p(seat).name} chooses one of their non-Black field cards to retrigger.`);
    }else{
      log(`${p(seat).name} uses Yellow, but there is no valid card to trap or retrigger.`);
    }
    return;
  }
  if(card.color==='Black'){
    if(p(enemy).field.length){game.pending={type:'target',player:seat,targetType:'blackSwap',cardId:card.id};status(`${p(seat).name} chooses a field card to swap with Black.`)}
    return;
  }
}
function resolveDiscard(seat,card){
  if(card.color==='Red')draw(seat,2);
  if(card.color==='Green'){
    let look=p(seat).deck.splice(-5);
    if(look.length){
      game.pending={type:'target',player:seat,targetType:'greenLook',cards:look};
      status(`${p(seat).name} looks at the top 5 cards and chooses 1 for hand.`);
    }else{
      log(`${p(seat).name} has no cards to look at.`);
    }
  }
  if(card.color==='Black'){
    if(p(opp(seat)).field.length){game.pending={type:'target',player:seat,targetType:'blackBounceEnemy'};}
  }
}
function chooseTarget(seat,type,index){
  if(!game.pending||game.pending.player!==seat||game.pending.targetType!==type)return;
  let enemy=opp(seat);
  if(type==='yellowMode'){
    // index 0 = trap opponent card, index 1 = retrigger one of your non-Black cards.
    let yellowId=game.pending.cardId;
    if(index===0&&p(enemy).field.length){
      game.pending={type:'target',player:seat,targetType:'yellowTrap',cardId:yellowId};
      render();
      return;
    }
    if(index===1&&p(seat).field.some(c=>c.color!=='Black')){
      game.pending={type:'target',player:seat,targetType:'yellowRetrigger',cardId:yellowId};
      render();
      return;
    }
    game.pending=null;
    finishAction(seat);
    return;
  }
  if(type==='yellowRetrigger'){
    let choices=p(seat).field.filter(c=>c.color!=='Black');
    let chosen=choices[index];
    if(chosen){
      log(`${p(seat).name} uses Yellow to retrigger ${chosen.color}.`);
      game.pending=null;
      resolveField(seat,chosen);
      if(!game.pending)finishAction(seat);
      render();
      sync();
      scheduleAutoProgress();
      return;
    }
    game.pending=null;
    finishAction(seat);
    return;
  }
  if(type==='greenReturn'&&p(seat).discard[index]){
    let c=p(seat).discard.splice(index,1)[0];
    p(seat).hand.push(c);
    log(`${p(seat).name} returns ${c.color} from discard to hand.`);
  }
  if(type==='greenLook'&&game.pending.cards&&game.pending.cards[index]){
    let picked=game.pending.cards.splice(index,1)[0];
    p(seat).hand.push(picked);
    // Put the rest on the bottom of the deck. The chosen player sees them, then they go back underneath.
    p(seat).deck.unshift(...game.pending.cards);
    log(`${p(seat).name} looks at 5 and takes ${picked.color}.`);
  }
  if(type==='redRemove'&&p(enemy).field[index]){
    let c=removeFieldCard(enemy,index,'discard'); if(c)log(`${p(seat).name} removes ${c.color} from opponent field.`)
  }
  if(type==='pinkHandDiscard'&&p(enemy).hand[index]){
    let c=p(enemy).hand.splice(index,1)[0];
    p(enemy).discard.push(c);
    log(`${p(seat).name} uses Pink. ${p(enemy).name} discards ${c.color} from hand.`);
  }
  if(type==='pinkRemoveDiscard'&&p(enemy).discard[index]){
    let removed=[];
    let c=p(enemy).discard.splice(index,1)[0];
    removed.push(c);
    // Remove up to 2 total. If there is another discard card, remove the top remaining card too.
    if(p(enemy).discard.length)removed.push(p(enemy).discard.pop());
    p(enemy).removed.push(...removed);
    log(`${p(seat).name} removes ${removed.map(x=>x.color).join(' and ')} from ${p(enemy).name}'s discard pile.`);
  }
  if(type==='yellowTrap'&&p(enemy).field[index]){
    let yidx=p(seat).field.findIndex(c=>c.id===game.pending.cardId);
    let c=p(enemy).field.splice(index,1)[0];
    if(yidx>=0){p(seat).field[yidx].trapped=p(seat).field[yidx].trapped||[];p(seat).field[yidx].trapped.push(c);log(`${p(seat).name} traps ${c.color} under Yellow.`)}
  }
  if(type==='blackBounceEnemy'&&p(enemy).field[index]){
    let c=removeFieldCard(enemy,index,'hand'); if(c)log(`${p(seat).name} returns ${c.color} to owner hand.`)
  }
  if(type==='blackSwap'&&p(enemy).field[index]){
    let myIdx=p(seat).field.findIndex(c=>c.id===game.pending.cardId);
    if(myIdx>=0){
      [p(seat).field[myIdx],p(enemy).field[index]]=[p(enemy).field[index],p(seat).field[myIdx]];
      log(`${p(seat).name} swaps Black with ${p(enemy).name}'s field card.`);
    }
  }
  game.pending=null;
  processTriggerQueue();
  if(!game.pending)finishAction(game.current);
}
function finishAction(seat){
  if(!game||game.over)return;
  game.actionUsed=true;
  checkWin(seat);
  if(game.over)return;
  // After a player's one action is fully resolved, the turn changes automatically.
  setTimeout(()=>{
    if(game&&!game.over&&!game.pending&&game.current===seat&&game.actionUsed){
      endTurn(seat);
      render();
      sync();
      scheduleAutoProgress();
    }
  },700);
}
function endTurn(seat){
  if(!game||seat!==game.current||game.pending)return;
  if(game.over)return;
  checkWin(seat);if(game.over)return;
  game.current=opp(game.current);
  game.actionUsed=false;
  game.firstTurn=false;
  draw(game.current,1);
  log(`${p(game.current).name}'s turn.`);
  status(game.current===localSeat?'Your turn.':(mode==='solo'?'Warren Bot turn.':'Opponent turn.'));
  if(mode==='solo'&&game.current===OPP)setTimeout(botTurn,700);
}
function hasPlayable(seat){return game&&!game.pending&&!game.over&&game.current===seat&&!game.actionUsed&&p(seat).hand.length>0}
function autoEndCheck(){
  if(game&&!game.pending&&!game.over&&game.current===localSeat&&!game.actionUsed&&!hasPlayable(localSeat)){
    log('No playable action. Turn ends automatically.');
    setTimeout(()=>sendMove({action:'endTurn'}),500);
  }
}
function botReactOrPass(){
  if(!game||!game.pending||game.pending.type!=='stack'||game.pending.reactFor!==OPP)return;
  let h=p(OPP).hand;
  let bi=h.findIndex(c=>c.color==='Blue');
  if(bi>=0&&h.length>=2&&Math.random()<.35){let ei=h.findIndex((c,i)=>i!==bi);blueReaction(OPP,bi,ei);return}
  let ki=h.findIndex(c=>c.color==='Black');
  if(ki>=0&&Math.random()<.2){blackReaction(OPP,ki);return}
  passReaction(OPP);
}
function botTurn(){
  if(!game||game.over||game.current!==OPP)return;
  if(game.pending)return;
  if(game.actionUsed){endTurn(OPP);render();sync();scheduleAutoProgress();return}
  let h=p(OPP).hand;
  if(!h.length){endTurn(OPP);render();sync();scheduleAutoProgress();return}
  let idx=h.findIndex(c=>c);
  let c=h[idx];
  let kind=cardCanDiscard(c)&&Math.random()<.25?'discard':'field';
  playCard(OPP,idx,kind);
  render();sync();scheduleAutoProgress();
  if(game.pending&&game.pending.type==='target'&&game.pending.player===OPP){
    setTimeout(()=>{if(game&&game.pending&&game.pending.type==='target'&&game.pending.player===OPP){chooseTarget(OPP,game.pending.targetType,0);render();sync();scheduleAutoProgress()}},450);
  }
}
let autoProgressTimer=null;
function scheduleAutoProgress(){
  if(autoProgressTimer)clearTimeout(autoProgressTimer);
  if(!game||game.over)return;

  if(game.pending&&game.pending.type==='stack'){
    let rf=game.pending.reactFor;
    if(mode==='solo'&&rf===OPP){
      autoProgressTimer=setTimeout(()=>{if(game&&game.pending&&game.pending.type==='stack'&&game.pending.reactFor===OPP&&!game.over){botReactOrPass();render();sync();scheduleAutoProgress()}},550);
      return;
    }
    if(!hasReaction(rf)){
      if(mode==='online'&&isHost&&rf!==localSeat){
        autoProgressTimer=setTimeout(()=>{if(game&&game.pending&&game.pending.type==='stack'&&game.pending.reactFor===rf&&!hasReaction(rf)){passReaction(rf);render();sync();scheduleAutoProgress()}},550);
        return;
      }
      if(rf===localSeat){
        status('No Blue or Black reaction in hand. Passing automatically.');
        autoProgressTimer=setTimeout(()=>{if(game&&game.pending&&game.pending.type==='stack'&&game.pending.reactFor===localSeat&&!hasReaction(localSeat))sendMove({action:'passReaction'})},550);
        return;
      }
    }
  }

  if(game.pending&&game.pending.type==='target'&&mode==='solo'&&game.pending.player===OPP){
    autoProgressTimer=setTimeout(()=>{if(game&&game.pending&&game.pending.type==='target'&&game.pending.player===OPP){chooseTarget(OPP,game.pending.targetType,0);render();sync();scheduleAutoProgress()}},550);
    return;
  }

  if(!game.pending&&!game.over){
    if(mode==='solo'&&game.current===OPP){
      autoProgressTimer=setTimeout(()=>{botTurn()},650);
      return;
    }
    if(game.actionUsed){
      autoProgressTimer=setTimeout(()=>{if(game&&!game.pending&&!game.over&&game.actionUsed){endTurn(game.current);render();sync();scheduleAutoProgress()}},650);
      return;
    }
    if(mode==='online'&&isHost&&!hasPlayable(game.current)){
      autoProgressTimer=setTimeout(()=>{if(game&&!game.pending&&!game.over&&!hasPlayable(game.current)){endTurn(game.current);render();sync();scheduleAutoProgress()}},650);
    }else{
      autoEndCheck();
    }
  }
}
function checkWin(seat){let field=p(seat).field.map(c=>c.color);let needed=['Red','Blue','Green','Yellow','Pink'];let rainbow=needed.every(c=>field.includes(c));let five=needed.some(c=>field.filter(x=>x===c).length>=5);if(rainbow||five){game.over=true;game.winner=seat;game.winReason=rainbow?'one of each non-black color':'five of one non-black color';log(`${p(seat).name} wins with ${game.winReason}.`);snd('sounds/win.mp3');showGameOver(seat)}}
function showGameOver(winner){render();let won=winner===localSeat;modal(won?'Congratulations — You Win!':'You Lost',won?`You won with ${game.winReason}!`:`${p(winner).name} won with ${game.winReason}.`);let img=document.createElement('img');img.src='assets/logo.png';img.className='gameOverLogo';$('modalContent').appendChild(img);addAction('Instant Rematch','',requestRematch);addAction('New Solo Game','',()=>{mode='solo';localSeat=0;startGame();closeModal()});addAction('Close','gray',closeModal);$('rematchBtn').classList.remove('hidden')}
function requestRematch(){if(mode==='solo'){startGame();closeModal();return}rematchRequested[localSeat]=true;log('You requested a rematch.');status('Rematch requested. Waiting for other player.');if(isHost){if(rematchRequested[0]&&rematchRequested[1]){startGame();closeModal()}else sync()}else conn?.send({type:'rematch',player:localSeat});render()}
function render(){if(!game)return;if(!game.pending)popupHidden=false;let me=p(localSeat), them=p(opp(localSeat));$('opponentName').textContent=mode==='solo'?'Warren Bot':'Opponent';$('oppFieldName').textContent=mode==='solo'?'Warren Bot Field':'Opponent Field';$('playerDeck').textContent=me.deck.length;$('playerHandCount').textContent=me.hand.length;$('playerDiscard').textContent=me.discard.length;$('oppDeck').textContent=them.deck.length;$('oppHand').textContent=them.hand.length;$('oppDiscard').textContent=them.discard.length;renderHand();renderOppHand();renderField('playerField',me.field,true);renderField('oppField',them.field,false);renderPile('playerDiscardTop',me.discard);renderPile('oppDiscardTop',them.discard);$('playerTurnBadge').textContent=game.current===localSeat?'Your Turn':'Waiting';$('oppTurnBadge').textContent=game.current!==localSeat?'Their Turn':'Waiting';$('playerTurnBadge').classList.toggle('active',game.current===localSeat||game.over);$('oppTurnBadge').classList.toggle('active',game.current!==localSeat||game.over);$('chooseBtn').disabled=!canAct(localSeat);$('endTurnBtn').disabled=!(game.current===localSeat&&!game.pending&&!game.over);if(game.pending)renderPending();else if(game.current===localSeat)status('Your turn.');else status(mode==='solo'?'Warren Bot turn.':'Waiting for opponent.');if(game.over)$('rematchBtn').classList.remove('hidden');else $('rematchBtn').classList.add('hidden');if($('showPopupBtn'))$('showPopupBtn').classList.toggle('hidden',!game.pending||!popupHidden);scheduleAutoProgress()}
function renderCard(c,clickable=false,handler=null){let d=document.createElement('div');d.className='card'+(clickable?' selectable':'');d.style.backgroundImage=`url('${img(c)}')`;d.draggable=clickable;d.innerHTML=`<span class="label">${c.color}${c.trapped?.length?' • trapped '+c.trapped.length:''}</span>`;if(c.trapped&&c.trapped.length){d.classList.add('hasTrapped');d.title='Trapped under this Yellow: '+c.trapped.map(x=>x.color).join(', ');d.onmouseenter=e=>showCardTooltip(e,'Trapped under Yellow',c.trapped);d.onmousemove=moveCardTooltip;d.onmouseleave=hideCardTooltip}if(clickable)d.onclick=handler;d.ondragstart=e=>{e.dataTransfer.setData('text/plain',c.id)};return d}
function renderHand(){let box=$('playerHand');box.innerHTML='';p(localSeat).hand.forEach((c,i)=>box.appendChild(renderCard(c,canAct(localSeat),()=>showHandOptions(i))));let pf=$('playerField');pf.ondragover=e=>{e.preventDefault();pf.classList.add('dragOver')};pf.ondragleave=()=>pf.classList.remove('dragOver');pf.ondrop=e=>{e.preventDefault();pf.classList.remove('dragOver');let id=e.dataTransfer.getData('text/plain');let i=p(localSeat).hand.findIndex(c=>c.id===id);if(i>=0)showHandOptions(i)}}
function renderOppHand(){let box=$('opponentHand');box.innerHTML='';for(let i=0;i<p(opp(localSeat)).hand.length;i++){let d=document.createElement('div');d.className='cardBackMini';box.appendChild(d)}}
function renderField(id,cards,own){let box=$(id);box.innerHTML='';cards.forEach((c,i)=>box.appendChild(renderCard(c,false)))}
function renderPile(id,pile){let el=$(id);el.style.backgroundImage=pile.length?`url('${img(pile[pile.length-1])}')`:`url('${BACK}')`;el.innerHTML=`<span class="pileCount">${pile.length}</span>`;el.title=pile.length?pile.map(c=>c.color).join(', '):'Empty discard pile';el.onmouseenter=e=>showCardTooltip(e,'Discard Pile',pile.slice().reverse());el.onmousemove=moveCardTooltip;el.onmouseleave=hideCardTooltip}
function showHandOptions(i){let c=p(localSeat).hand[i];modal(`${c.color} Card`,'Choose how to use this card.');let grid=document.createElement('div');grid.className='choiceGrid';let a=document.createElement('div');a.className='choiceCard';a.innerHTML=`<img src="${img(c)}"><button>Add to Field</button>`;a.querySelector('button').onclick=()=>{closeModal();sendMove({action:'play',index:i,kind:'field'})};grid.appendChild(a);if(cardCanDiscard(c)){let b=document.createElement('div');b.className='choiceCard';b.innerHTML=`<img src="${img(c)}"><button>Discard Action</button>`;b.querySelector('button').onclick=()=>{closeModal();sendMove({action:'play',index:i,kind:'discard'})};grid.appendChild(b)}$('modalContent').appendChild(grid)}
function renderPending(){let pend=game.pending;if(popupHidden){status('Popup hidden. Use Show Popup to continue choosing or reacting.');return;}if(pend.type==='stack'&&pend.reactFor===localSeat){
  if(!hasReaction(localSeat)){
    closeReactionModalOnly();
    let top=stackTop();let playName=top?(top.kind==='field'?`${p(top.player).name}'s ${top.color} card`:`${p(top.player).name}'s ${top.color} Reaction`):'the play';
    status(`No Blue or Black reaction in hand. ${playName} will resolve automatically.`);
    return;
  }
  let h=p(localSeat).hand;let blues=h.map((c,i)=>[c,i]).filter(x=>x[0].color==='Blue');let blacks=h.map((c,i)=>[c,i]).filter(x=>x[0].color==='Black');let top=stackTop();let playName=top?(top.kind==='field'?`${p(top.player).name}'s ${top.color} card`:`${p(top.player).name}'s ${top.color} Reaction`):'the play';modal('Reaction Window',`${playName} is waiting to resolve. You may react with Blue or Black from your hand, or let it happen. Reactions can be reacted to, so this continues until no one reacts.`);blues.forEach(([c,i])=>{if(h.length>1)addAction('Use Blue Reaction','',()=>chooseBlueExtra(i))});blacks.forEach(([c,i])=>addAction('Use Black Reaction','',()=>{closeModal();sendMove({action:'blackReaction',blackIndex:i})}));addAction('Let It Happen','gray',()=>{closeModal();sendMove({action:'passReaction'})});addAction('Hide Popup','gray',hidePopup)
}else if(pend.type==='stack'){
  let top=stackTop();status(`${p(pend.reactFor).name} may react to ${top?top.color||'reaction':'the play'}.`)
}else if(pend.type==='target'&&pend.player===localSeat){
  showTargetChoices(pend);
}}
function showTargetChoices(pend){
  let enemy=opp(localSeat);
  let title='Choose Target', text='Choose a card.';
  let cards=[], owner=enemy, type=pend.targetType;
  if(type==='greenReturn'){
    title='Green Field Ability'; text='Choose one card from your discard pile to return to your hand.'; cards=p(localSeat).discard; owner=localSeat;
  }else if(type==='greenLook'){
    title='Green Discard Action'; text='Choose one of these cards to put into your hand. The rest go on the bottom of your deck.'; cards=pend.cards||[]; owner=localSeat;
  }else if(type==='pinkHandDiscard'){
    title='Pink Field Ability'; text=`${p(enemy).name} reveals their hand. Choose one card to put into their discard pile.`; cards=p(enemy).hand; owner=enemy;
  }else if(type==='pinkRemoveDiscard'){
    title='Pink Field Ability'; text=`Choose one card from ${p(enemy).name}'s discard pile. It will remove that card and one more if available.`; cards=p(enemy).discard; owner=enemy;
  }else if(type==='redRemove'){
    title='Red Field Ability'; text='Choose one opponent field card to put into its owner’s discard pile.'; cards=p(enemy).field; owner=enemy;
  }else if(type==='yellowMode'){
    modal('Yellow Field Ability',"Choose Yellow's field effect: trap an opponent card, or retrigger one of your non-Black cards in play.");
    if(p(enemy).field.length)addAction('Trap Opponent Card','',()=>{closeModal();sendMove({action:'target',targetType:type,index:0})});
    if(p(localSeat).field.some(c=>c.color!=='Black'))addAction('Retrigger Your Non-Black Card','',()=>{closeModal();sendMove({action:'target',targetType:type,index:1})});
    addAction('Cancel / Continue','gray',()=>{closeModal();sendMove({action:'target',targetType:type,index:-1})});addAction('Hide Popup','gray',hidePopup);
    return;
  }else if(type==='yellowTrap'){
    title='Yellow Field Ability'; text='Choose one opponent field card to trap under Yellow.'; cards=p(enemy).field; owner=enemy;
  }else if(type==='yellowRetrigger'){
    title='Yellow Field Ability'; text='Choose one of your non-Black field cards to retrigger its Field of Play ability.'; cards=p(localSeat).field.filter(c=>c.color!=='Black'); owner=localSeat;
  }else if(type==='blackBounceEnemy'){
    title='Black Discard Action'; text='Choose one field card to return to its owner’s hand.'; cards=p(enemy).field; owner=enemy;
  }else if(type==='blackSwap'){
    title='Black Field Ability'; text='Choose one opponent field card to swap control with Black.'; cards=p(enemy).field; owner=enemy;
  }
  modal(title,text);
  let grid=document.createElement('div');grid.className='choiceGrid';
  if(!cards.length){
    let none=document.createElement('p');none.textContent='No valid cards to choose.';$('modalContent').appendChild(none);addAction('Continue','gray',()=>{closeModal();sendMove({action:'target',targetType:type,index:-1})});return;
  }
  cards.forEach((c,i)=>{let item=document.createElement('div');item.className='choiceCard';item.innerHTML=`<img src="${img(c)}"><button>Choose ${c.color}</button>`;item.querySelector('button').onclick=()=>{closeModal();sendMove({action:'target',targetType:type,index:i})};grid.appendChild(item)});
  $('modalContent').appendChild(grid);addAction('Hide Popup','gray',hidePopup);
}
function closeReactionModalOnly(){if(!$('modal').classList.contains('hidden')&&$('modalTitle').textContent==='Reaction Window')closeModal()}
function hidePopup(){popupHidden=true;closeModal();render()}
function showPopup(){popupHidden=false;if(game&&game.pending)renderPending();render()}
function showCardTooltip(e,title,cards){let tip=$('cardTooltip');if(!tip||!cards||!cards.length)return;tip.innerHTML=`<b>${title}</b><div class="tipCards">${cards.map(c=>`<div class="tipCard" style="background-image:url('${img(c)}')"><span>${c.color}</span></div>`).join('')}</div>`;tip.classList.remove('hidden');moveCardTooltip(e)}
function moveCardTooltip(e){let tip=$('cardTooltip');if(!tip)return;let x=Math.min(e.clientX+18,window.innerWidth-260);let y=Math.min(e.clientY+18,window.innerHeight-220);tip.style.left=x+'px';tip.style.top=y+'px'}
function hideCardTooltip(){let tip=$('cardTooltip');if(tip)tip.classList.add('hidden')}
function chooseBlueExtra(blueIndex){modal('Blue Reaction Cost','Choose one extra card from your hand to discard with Blue. The extra card ability does not happen.');let grid=document.createElement('div');grid.className='choiceGrid';p(localSeat).hand.forEach((c,i)=>{if(i===blueIndex)return;let item=document.createElement('div');item.className='choiceCard';item.innerHTML=`<img src="${img(c)}"><button>Discard ${c.color}</button>`;item.querySelector('button').onclick=()=>{closeModal();sendMove({action:'blueReaction',blueIndex,extraIndex:i})};grid.appendChild(item)});$('modalContent').appendChild(grid);addAction('Hide Popup','gray',hidePopup)}
function chooseHand(){if(canAct(localSeat)&&p(localSeat).hand.length)showHandOptions(0)}
function showRules(){modal('Chromatic Clash Rules','Watch the quick how-to-play video below, then use the card guide underneath as a reminder.');let video=document.createElement('div');video.className='rulesVideoWrap';video.innerHTML='<iframe class="rulesVideo" width="560" height="315" src="https://www.youtube.com/embed/VZUa1rzIzMo?si=OSNtGFgHMY3pPMcu&rel=0&playsinline=1" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><p class="videoFallback">If the video shows Error 153 while testing locally, upload the game to GitHub Pages or open the video on YouTube.</p>';$('modalContent').appendChild(video);let text=document.createElement('p');text.textContent='Starting hand: 3 cards. First player skips first draw. On your turn draw 1, then add one card to field or use one discard action. Blue and Black can react from hand. You can react to a reaction, and the reaction chain continues until both players have no more reactions or let it happen. Win with Red, Blue, Green, Yellow, and Pink on field, or 5 of one non-black color.';$('modalContent').appendChild(text);addAction('Close','gray',closeModal)}
function modal(title,text){$('modalTitle').textContent=title;$('modalText').textContent=text;$('modalContent').innerHTML='';$('modalActions').innerHTML='';$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden')}
function addAction(label,cls,fn){let b=document.createElement('button');b.textContent=label;if(cls==='gray')b.style.background='linear-gradient(#eee,#aaa)';b.onclick=fn;$('modalActions').appendChild(b)}
window.addEventListener('DOMContentLoaded',()=>{$('soloBtn').onclick=()=>{mode='solo';localSeat=0;$('onlinePanel').classList.add('hidden');startGame();bg();showRules()};$('hostBtn').onclick=hostOnline;$('joinBtn').onclick=joinOnline;$('copyCodeBtn').onclick=()=>navigator.clipboard?.writeText($('roomCode').textContent);$('chooseBtn').onclick=chooseHand;$('endTurnBtn').onclick=()=>sendMove({action:'endTurn'});$('rematchBtn').onclick=requestRematch;if($('showPopupBtn'))$('showPopupBtn').onclick=showPopup;$('rulesBtn').onclick=showRules;$('closeModal').onclick=closeModal;$('logToggleBtn').onclick=()=>{$('logBox').classList.remove('hidden');$('logToggleBtn').classList.add('hidden')};$('hideLogBtn').onclick=()=>{$('logBox').classList.add('hidden');$('logToggleBtn').classList.remove('hidden')};$('muteBtn').onclick=()=>setMuted(!muted);document.addEventListener('pointerdown',startBg,{passive:true});startGame();showRules()});
