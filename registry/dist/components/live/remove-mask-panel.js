!function(e,o){"object"==typeof exports&&"object"==typeof module?module.exports=o():"function"==typeof define&&define.amd?define([],o):"object"==typeof exports?exports["live/remove-mask-panel"]=o():e["live/remove-mask-panel"]=o()}(globalThis,(()=>(()=>{"use strict";var e={d:(o,t)=>{for(var n in t)e.o(t,n)&&!e.o(o,n)&&Object.defineProperty(o,n,{enumerable:!0,get:t[n]})},o:(e,o)=>Object.prototype.hasOwnProperty.call(e,o)},o={};e.d(o,{component:()=>a});const t=coreApis.componentApis.define,n=coreApis.utils.urls,r=async()=>{const e=new MutationObserver((o=>{o.forEach((o=>{o.addedNodes.forEach((o=>{"web-player-module-area-mask-panel"===o.id&&(o.parentNode?.removeChild(o),e.disconnect())}))}))}));e.observe(document.body,{childList:!0,subtree:!0})},a=(0,t.defineComponentMetadata)({name:"removeLiveMaskPanel",displayName:"删除直播马赛克遮罩",author:{name:"Liki4",link:"https://github.com/Liki4"},tags:[componentsTags.live,componentsTags.style],description:{"zh-CN":"删除观看直播时某些分区的马赛克遮罩."},entry:r,reload:r,urlInclude:n.liveUrls,commitHash:"7e5167c8b2b138051c1829ed8a366b2fba26ec70",coreVersion:"2.9.5"});return o=o.component})()));