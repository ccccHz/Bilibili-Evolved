/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["live/autoResolution"] = factory();
	else
		root["live/autoResolution"] = factory();
})(globalThis, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./registry/lib/components/live/autoResolution/index.ts":
/*!**************************************************************!*\
  !*** ./registry/lib/components/live/autoResolution/index.ts ***!
  \**************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"component\": () => (/* binding */ component)\n/* harmony export */ });\n/* harmony import */ var _components_define__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @/components/define */ \"@/components/define\");\n/* harmony import */ var _components_define__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_components_define__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _core_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @/core/utils */ \"@/core/utils\");\n/* harmony import */ var _core_utils__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_core_utils__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var _core_utils_urls__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @/core/utils/urls */ \"@/core/utils/urls\");\n/* harmony import */ var _core_utils_urls__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_core_utils_urls__WEBPACK_IMPORTED_MODULE_2__);\n\n\n\nconst entry = async () => {\n  if (!(0,_core_utils__WEBPACK_IMPORTED_MODULE_1__.getUID)()) {\n    return;\n  }\n  console.log('liveAutoResolution');\n  const {\n    select\n  } = await Promise.resolve(/*! import() */).then(__webpack_require__.t.bind(__webpack_require__, /*! @/core/spin-query */ \"@/core/spin-query\", 23));\n  const video = await select('#live-player > video');\n  const changeQuailty = () => {\n    let {\n      livePlayer\n    } = unsafeWindow;\n    if (!livePlayer) {\n      livePlayer = unsafeWindow.top.livePlayer;\n    }\n    const info = livePlayer.getPlayerInfo();\n    if (info.qualityCandidates.length > 1) {\n      console.log(info.qualityCandidates);\n      for (let index = 0; index < info.qualityCandidates.length; index++) {\n        // 想要默认其他画质,请修改\"原画\"为\"原画PRO\"诸如此类\n        if (info.qualityCandidates[index].desc === '原画') {\n          livePlayer.switchQuality(info.qualityCandidates[index].qn);\n        }\n        // else{\n        //  livePlayer.switchQuality(info.qualityCandidates[0].qn)\n        // }\n      }\n    }\n  };\n\n  if (video !== null) {\n    changeQuailty();\n  }\n  // const decideToChange = () => {\n  //   if (video.paused) {\n  //     video.addEventListener('play', changeQuailty)\n  //   } else {\n  //     changeQuailty()\n  //   }\n  // }\n\n  // 等待livePlayer加载\n  // const interval: NodeJS.Timer = setInterval(() => {\n  //   let { livePlayer } = unsafeWindow\n  //   const p2pLivePlayer = unsafeWindow.$P2PLivePlayer\n  //   if (typeof livePlayer === 'undefined' && typeof p2pLivePlayer === 'undefined') {\n  //     return\n  //   }\n  //   clearInterval(interval)\n  //   if (typeof livePlayer === 'undefined') {\n  //     livePlayer = p2pLivePlayer\n  //   }\n  //   decideToChange()\n  // }, 10)\n};\n\nconst component = (0,_components_define__WEBPACK_IMPORTED_MODULE_0__.defineComponentMetadata)({\n  name: 'liveAutoResolution',\n  displayName: '直播自动高分辨率',\n  description: {\n    'zh-CN': '直播自动切换到最高分辨率'\n  },\n  author: [{\n    name: 'chz',\n    link: 'axn'\n  }],\n  tags: [componentsTags.live, componentsTags.style],\n  entry,\n  // reload: entry,\n  urlInclude: _core_utils_urls__WEBPACK_IMPORTED_MODULE_2__.liveUrls,\n  commitHash: \"a8ca704d63a0e1ed1af7def55c803364c8dd491f\",\n  coreVersion: \"2.9.5\"\n});\n\n//# sourceURL=webpack://@bevo/core/./registry/lib/components/live/autoResolution/index.ts?");

/***/ }),

/***/ "@/components/define":
/*!******************************************************!*\
  !*** external ["coreApis","componentApis","define"] ***!
  \******************************************************/
/***/ ((module) => {

module.exports = coreApis.componentApis.define;

/***/ }),

/***/ "@/core/spin-query":
/*!*****************************************!*\
  !*** external ["coreApis","spinQuery"] ***!
  \*****************************************/
/***/ ((module) => {

module.exports = coreApis.spinQuery;

/***/ }),

/***/ "@/core/utils/urls":
/*!********************************************!*\
  !*** external ["coreApis","utils","urls"] ***!
  \********************************************/
/***/ ((module) => {

module.exports = coreApis.utils.urls;

/***/ }),

/***/ "@/core/utils":
/*!*************************************!*\
  !*** external ["coreApis","utils"] ***!
  \*************************************/
/***/ ((module) => {

module.exports = coreApis.utils;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/create fake namespace object */
/******/ 	(() => {
/******/ 		var getProto = Object.getPrototypeOf ? (obj) => (Object.getPrototypeOf(obj)) : (obj) => (obj.__proto__);
/******/ 		var leafPrototypes;
/******/ 		// create a fake namespace object
/******/ 		// mode & 1: value is a module id, require it
/******/ 		// mode & 2: merge all properties of value into the ns
/******/ 		// mode & 4: return value when already ns object
/******/ 		// mode & 16: return value when it's Promise-like
/******/ 		// mode & 8|1: behave like require
/******/ 		__webpack_require__.t = function(value, mode) {
/******/ 			if(mode & 1) value = this(value);
/******/ 			if(mode & 8) return value;
/******/ 			if(typeof value === 'object' && value) {
/******/ 				if((mode & 4) && value.__esModule) return value;
/******/ 				if((mode & 16) && typeof value.then === 'function') return value;
/******/ 			}
/******/ 			var ns = Object.create(null);
/******/ 			__webpack_require__.r(ns);
/******/ 			var def = {};
/******/ 			leafPrototypes = leafPrototypes || [null, getProto({}), getProto([]), getProto(getProto)];
/******/ 			for(var current = mode & 2 && value; typeof current == 'object' && !~leafPrototypes.indexOf(current); current = getProto(current)) {
/******/ 				Object.getOwnPropertyNames(current).forEach((key) => (def[key] = () => (value[key])));
/******/ 			}
/******/ 			def['default'] = () => (value);
/******/ 			__webpack_require__.d(ns, def);
/******/ 			return ns;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./registry/lib/components/live/autoResolution/index.ts");
/******/ 	__webpack_exports__ = __webpack_exports__.component;
/******/ 	
/******/ 	return __webpack_exports__;
/******/ })()
;
});