var T=Object.defineProperty;var _=(y,t,o)=>t in y?T(y,t,{enumerable:!0,configurable:!0,writable:!0,value:o}):y[t]=o;var M=(y,t,o)=>_(y,typeof t!="symbol"?t+"":t,o);import{M as $,F as g,L as d,g as k,S as w,C as A,i as v}from"../flash-rolls-5e.js";const{ApplicationV2:q,HandlebarsApplicationMixin:b}=foundry.applications.api,R=class R extends b(q){constructor(t={}){super(t),this.actors=t.actors||[],this.rollSelections=new Map,this.rollMode="publicroll",this.flavor="",this.hideNpcNames=!1}async _prepareContext(t={}){const o=await super._prepareContext(t),l={};for(const[r,s]of Object.entries(CONFIG.DND5E.abilities))l[r]={label:game.i18n.localize(s.label),abbreviation:game.i18n.localize(s.abbreviation)};const e={};for(const[r,s]of Object.entries(CONFIG.DND5E.skills))e[r]={label:game.i18n.localize(s.label)};const a=Object.entries(CONFIG.Dice.rollModes).map(([r,s])=>({value:r,labelKey:typeof s=="string"?s:(s==null?void 0:s.label)||(s==null?void 0:s.name)||r,selected:r===this.rollMode}));return{...o,actors:this.actors.map(r=>{const s=r.actor||r;return{id:s.id,name:s.name,img:s.img}}),abilities:l,skills:e,rollMode:this.rollMode,rollModes:a,flavor:this.flavor,hideNpcNames:this.hideNpcNames}}_attachPartListeners(t,o,l){super._attachPartListeners(t,o,l);const e=o.querySelector(".roll-mode-select");e&&e.addEventListener("change",i=>{this.rollMode=i.target.value});const a=o.querySelector('input[name="flavor"]');a&&a.addEventListener("input",i=>{this.flavor=i.target.value});const r=o.querySelector('input[name="hideNpcNames"]');r&&r.addEventListener("change",i=>{this.hideNpcNames=i.target.checked}),o.querySelectorAll(".actor-roll-type").forEach(i=>{const c=i.dataset.actorId;i.value&&this.rollSelections.set(c,i.value),i.addEventListener("change",n=>{const u=n.target.dataset.actorId;this.rollSelections.set(u,n.target.value)})})}async _onRequest(t,o){if(this.actors.length===0){g.notify("warn",game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));return}for(const e of this.actors){const a=e.actor||e;if(!this.rollSelections.get(a.id)){g.notify("warn",game.i18n.format("FLASH_ROLLS.notifications.noRollSelected",{name:a.name}));return}}const l={actors:this.actors.map(e=>{const a=e.actor||e;return{actor:a,uniqueId:e.uniqueId||a.id,tokenId:e.tokenId||null,rollType:this.rollSelections.get(a.id)}}),rollMode:this.rollMode,flavor:this.flavor,hideNpcNames:this.hideNpcNames};await this._executeContestedRolls(l),this.close()}async _executeContestedRolls(t){d.log("_executeContestedRolls",[t]);const o=k(),e=w.get(o.groupRollsMsgEnabled.tag)?foundry.utils.randomID():null;d.log("ContestedRoll - groupRollId",[e]);const a={...t,isContestedRoll:!0};if(e){const r=t.actors.map(n=>{const u=n.actor,h=n.uniqueId||u.id,f=n.tokenId||null,[m,p]=n.rollType.split(":");return{actor:u,uniqueId:h,tokenId:f,rollType:m,rollKey:p}}),s=t.actors[0].rollType.split(":"),i=s[0],c=s[1];await A.createGroupRollMessage(r,i,c,a,e)}for(const r of t.actors)await this._executeRollForActor(r,a,e)}async _executeRollForActor(t,o,l=null){var h,f,m;const e=t.actor,a=t.tokenId,[r,s]=t.rollType.split(":");d.log("_executeRollForActor",[e.name,r,s,"tokenId:",a,"groupRollId:",l]);const i=k(),c=v.isPlayerOwned(e),n=w.get(i.rollRequestsEnabled.tag),u=v.shouldSkipRollDialog({isPC:c,isNPC:!c,sendRequest:c&&n});try{if(r==="dice"){const p=await new Roll(s,e.getRollData()).evaluate(),S={actor:e};if(a){const F=((h=canvas.tokens)==null?void 0:h.get(a))||((m=(f=game.scenes.active)==null?void 0:f.tokens)==null?void 0:m.get(a));F&&(S.token=F)}const L=ChatMessage.implementation.getSpeaker(S),N=o.flavor||game.i18n.localize("FLASH_ROLLS.ui.dialogs.contestedRoll.customRoll"),I={speaker:L,flavor:N};o.rollMode&&(I.rollMode=o.rollMode),l&&(I.flags={"flash-rolls-5e":{groupRollId:l,isContestedRoll:!0}}),await p.toMessage(I)}else{const p=r==="ability"?"abilitycheck":r,S=a||e.id;await g.requestRoll({requestType:p,rollKey:s,actorIds:[S],sendAsRequest:c&&n,skipRollDialog:u,groupRollId:l,isContestedRoll:o.isContestedRoll||!1})}}catch(p){d.error("Error executing roll",[p]),ui.notifications.error(game.i18n.format("FLASH_ROLLS.notifications.rollFailed",{name:e.name}),[p])}}async _onShowCode(t,o){d.log("ContestedRollDialog _onShowCode",[]);for(const e of this.actors){const a=e.actor||e;if(!this.rollSelections.get(a.id)){g.notify("warn",game.i18n.format("FLASH_ROLLS.notifications.noRollSelected",{name:a.name}));return}}const l=this._generateMacroCode();d.log("Generated macro code:",[l]);try{await this._createContestedRollMacro(l),this.close()}catch(e){d.error("Failed to create macro:",[e]),ui.notifications.error(`Failed to create macro: ${e.message}`)}}_generateMacroCode(){const t=this.actors[0].actor||this.actors[0],o=this.rollSelections.get(t.id);if(!o)return g.notify("warn","Please select a roll type for all actors before creating a macro."),null;const l=o.split(":"),e=l[0]==="ability"?"abilitycheck":l[0],a=l[1],r=this.actors.map(c=>{const n=c.actor||c,u=this.rollSelections.get(n.id);if(!u)return null;const[h,f]=u.split(":"),m=h==="ability"?"abilitycheck":h;return h==="dice"?`  // ${n.name}: Custom Dice Roll
  const actor${n.id} = game.actors.get("${n.id}");
  if (actor${n.id}) {
    const roll = await new Roll("${f}", actor${n.id}.getRollData()).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.implementation.getSpeaker({ actor: actor${n.id} }),
      flavor: "${this.flavor||"Custom Roll"}",
      rollMode: "${this.rollMode}",
      flags: {
        "flash-rolls-5e": {
          groupRollId: groupRollId,
          isContestedRoll: true
        }
      }
    });
  }`:`  // ${n.name}: ${h}:${f}
  await FlashAPI.requestRoll({
    requestType: "${m}",
    rollKey: "${f}",
    actorIds: ["${n.id}"],
    skipRollDialog: true,
    groupRollId: groupRollId,
    isContestedRoll: true
  });`});if(r.includes(null))return null;const s=r.join(`

`),i=this.actors.map(c=>{const n=c.actor||c;return`    {
      actor: game.actors.get("${n.id}"),
      uniqueId: "${n.id}",
      tokenId: null
    }`}).join(`,
`);return`// Flash Token Bar: Contested Roll
// Roll Mode: ${this.rollMode}
${this.flavor?`// Flavor: ${this.flavor}`:""}

(async () => {
  try {
    const groupRollId = foundry.utils.randomID();

    const actorEntries = [
${i}
    ];

    await FlashAPI.createGroupRollMessage(
      actorEntries,
      "${e}",
      "${a}",
      { rollMode: "${this.rollMode}", flavor: "${this.flavor}", isContestedRoll: true },
      groupRollId
    );

${s}
  } catch (error) {
    ui.notifications.error("Failed to execute contested roll: " + error.message);
  }
})();`}async _createContestedRollMacro(t){const o=k(),l=w.get(o.addMacrosToFolder.tag);let e=null;l&&(e=await this._ensureFlashRollsFolder());const s={name:`Contested Roll: ${this.actors.map(c=>(c.actor||c).name).join(" vs ")}`,type:"script",command:t,img:"modules/flash-rolls-5e/assets/bolt-circle.svg",...e&&{folder:e},flags:{"flash-rolls-5e":{type:"contested-roll",actors:this.actors.map(c=>(c.actor||c).id),rollSelections:Array.from(this.rollSelections.entries()),rollMode:this.rollMode,flavor:this.flavor}}},i=await Macro.create(s);return g.notify("info",game.i18n.format("FLASH_ROLLS.notifications.macroCreated",{macroName:i.name})),i.sheet.render(!0),i}async _ensureFlashRollsFolder(){const t="Flash Token Bar";let o=game.folders.find(l=>l.type==="Macro"&&l.name===t);if(!o)try{o=await Folder.create({name:t,type:"Macro",color:"#302437",sort:0}),d.log("Created Flash Token Bar macro folder",[o])}catch(l){return d.error("Failed to create Flash Token Bar macro folder:",[l]),g.notify("warn","Failed to create Flash Token Bar macro folder. Macro will be created without folder organization."),null}return(o==null?void 0:o.id)||null}async _onDeleteActor(t,o){const l=o.dataset.actorId;d.log("ContestedRollDialog _onDeleteActor",[l]),this.actors=this.actors.filter(e=>e.id!==l),this.rollSelections.delete(l),await this.render(!0)}static async show(t){if(!t||t.length===0)return g.notify("warn",game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected")),null;const o=new this({actors:t});return o.render(!0),o}};M(R,"DEFAULT_OPTIONS",{id:"flash5e-contested-roll-dialog",classes:["flash5e-dialog","flash5e-contested-roll-dialog"],tag:"div",window:{title:"FLASH_ROLLS.ui.dialogs.contestedRoll.title",icon:"fas fa-swords",resizable:!1,positioned:!0,frame:!0},position:{width:540,height:"auto"},actions:{request:R.prototype._onRequest,"show-code":R.prototype._onShowCode}}),M(R,"PARTS",{main:{template:`modules/${$}/templates/contested-roll-dialog.hbs`}});let C=R;export{C as ContestedRollDialog};
//# sourceMappingURL=ContestedRollDialog.js.map
