!function(e,t){"object"==typeof exports&&"object"==typeof module?module.exports=t():"function"==typeof define&&define.amd?define([],t):"object"==typeof exports?exports["feeds/full-title"]=t():e["feeds/full-title"]=t()}(globalThis,(()=>(()=>{var e,t,o={810:(e,t,o)=>{var n=o(218)((function(e){return e[1]}));n.push([e.id,".custom-navbar .video-card .title {\n  max-height: unset !important;\n  display: block !important;\n}",""]),e.exports=n},218:e=>{"use strict";
// eslint-disable-next-line func-names
e.exports=function(e){var t=[];return t.toString=function(){return this.map((function(t){var o=e(t);return t[2]?"@media ".concat(t[2]," {").concat(o,"}"):o})).join("")},
// eslint-disable-next-line func-names
t.i=function(e,o,n){"string"==typeof e&&(
// eslint-disable-next-line no-param-reassign
e=[[null,e,""]]);var r={};if(n)for(var i=0;i<this.length;i++){
// eslint-disable-next-line prefer-destructuring
var f=this[i][0];null!=f&&(r[f]=!0)}for(var a=0;a<e.length;a++){var s=[].concat(e[a]);n&&r[s[0]]||(o&&(s[2]?s[2]="".concat(o," and ").concat(s[2]):s[2]=o),t.push(s))}},t}},733:(e,t,o)=>{var n=o(810);n&&n.__esModule&&(n=n.default),e.exports="string"==typeof n?n:n.toString()}},n={};function r(e){var t=n[e];if(void 0!==t)return t.exports;var i=n[e]={id:e,exports:{}};return o[e](i,i.exports,r),i.exports}t=Object.getPrototypeOf?e=>Object.getPrototypeOf(e):e=>e.__proto__,r.t=function(o,n){if(1&n&&(o=this(o)),8&n)return o;if("object"==typeof o&&o){if(4&n&&o.__esModule)return o;if(16&n&&"function"==typeof o.then)return o}var i=Object.create(null);r.r(i);var f={};e=e||[null,t({}),t([]),t(t)];for(var a=2&n&&o;"object"==typeof a&&!~e.indexOf(a);a=t(a))Object.getOwnPropertyNames(a).forEach((e=>f[e]=()=>o[e]));return f.default=()=>o,r.d(i,f),i},r.d=(e,t)=>{for(var o in t)r.o(t,o)&&!r.o(e,o)&&Object.defineProperty(e,o,{enumerable:!0,get:t[o]})},r.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),r.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})};var i={};return(()=>{"use strict";r.d(i,{component:()=>o});const e=coreApis.componentApis.define,t=coreApis.componentApis.styledComponent,o=(0,e.defineComponentMetadata)({...(0,t.toggleStyle)("fullFeedsTitle",(()=>Promise.resolve().then(r.t.bind(r,733,23)))),displayName:"展开动态标题",description:{"zh-CN":"在顶栏的视频动态中, 无论标题多长总是完全展开."},tags:[componentsTags.feeds,componentsTags.style],commitHash:"fbf72b3bfd121503f29f3d3dfd762f87ef030a7f",coreVersion:"2.9.4"})})(),i=i.component})()));