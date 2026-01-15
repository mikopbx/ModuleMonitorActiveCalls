"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 11 2018
 *
 */
var idUrl = 'module-monitor-active-calls';
var idForm = 'module-monitor-active-calls-form';
var className = 'ModuleMonitorActiveCalls';
var inputClassName = 'mikopbx-module-input';

/* global $, globalRootUrl, globalTranslate, Form, Config, Vue, Extensions */
var ModuleMonitorActiveCalls = {
  isInit: true,
  contactsCacheTtlMs: 120 * 60 * 1000,
  queueNameSelector: '#app-queue div.scrolling.dropdown',
  $formObj: $('#' + idForm),
  $checkBoxes: $('#' + idForm + ' .ui.checkbox'),
  $dropDowns: $('#' + idForm + ' .ui.dropdown'),
  activeChannelsUrl: globalRootUrl + idUrl + "/getActiveChannels",
  activeChannelsUrlV2: globalRootUrl + idUrl + "/getActiveChannelsV2",
  backendEnableUrl: globalRootUrl + idUrl + "/backandEnable",
  executeCallUrl: globalRootUrl + idUrl + "/executeCall",
  saveUserActionUrl: globalRootUrl + idUrl + "/saveUser",
  $widget: undefined,
  /**
   * Field validation rules
   * https://semantic-ui.com/behaviors/form.html
   */
  validateRules: {},
  /**
   * On page load we init some Semantic UI library
   */
  initialize: function initialize() {
    this.initContactsCache();
    this.requestBackendEnable();
    $("#nowUser.dropdown.enable").dropdown({
      onChange: function onChange(value, text, $choice) {
        window[className].onChangeSetting('adminUserId', value);
      }
    });
    $("#minWaitVisible.dropdown.enable").dropdown({
      onChange: function onChange(value, text, $choice) {
        $('#minWaitVisibleValue').val(value);
        window[className].onChangeSetting('minWaitVisible', value);
      }
    });
    var userNumber = $('#userNumber').val();
    window[className].$widgetQueues = new Vue({
      el: '#app-queue',
      delimiters: ["<%", "%>"],
      methods: {
        updatedCallsFromResponse: function updatedCallsFromResponse(data) {
          var _this = this;
          var queueNameEl = $(window[className].queueNameSelector);
          this.minWaitVisible = 1 * $('#minWaitVisibleValue').val();
          this.queues = data.queues;
          var queueId = $('#queueId').val();
          if (queueId in data.queues) {
            this.id = data.queues[queueId].id;
            this.name = data.queues[queueId].name;
            this.number = data.queues[queueId].number;
            this.agents = data.queues[queueId].agents;
            this.agentsList = this.buildAgentsList(this.agents);
            this.calls = Array.isArray(data.queues[queueId].calls) ? data.queues[queueId].calls : [];
            this.allCalls = data.calls;
          } else {
            this.calls = [];
            this.agentsList = [];
          }
          if (queueNameEl.dropdown('is hidden')) {
            queueNameEl.dropdown({
              onChange: function onChange(value, text, $choice) {
                window[className].onChangeSetting('queueId', value);
              }
            });
            if (queueNameEl.dropdown('get value') === '') {
              window[className].isInit = true;
              queueNameEl.dropdown('set value', $('#queueId').val());
              window[className].isInit = false;
            }
          }

          // Normalize Semantic UI Card typography after render
          this.$nextTick(function () {
            _this.normalizeAgentCards();
          });
        },
        buildAgentsList: function buildAgentsList(agentsObj) {
          var entries = Object.entries(agentsObj || {});
          var available = [];
          var unavailable = [];
          for (var _i = 0, _entries = entries; _i < _entries.length; _i++) {
            var _entries$_i = _slicedToArray(_entries[_i], 2),
              number = _entries$_i[0],
              agent = _entries$_i[1];
            var state = (agent === null || agent === void 0 ? void 0 : agent.state) || '';
            var item = _objectSpread({
              number: number
            }, agent);
            if (state === 'Unavailable') {
              unavailable.push(item);
            } else {
              available.push(item);
            }
          }
          return available.concat(unavailable);
        },
        normalizePhone10: function normalizePhone10(phone) {
          var digits = String(phone || '').replace(/\D+/g, '');
          if (digits.length <= 10) return digits;
          return digits.slice(-10);
        },
        updateContactFromWs: function updateContactFromWs(contact) {
          var phone10 = this.normalizePhone10(contact === null || contact === void 0 ? void 0 : contact.number);
          if (!phone10) return;
          var client = String((contact === null || contact === void 0 ? void 0 : contact.client) || '').trim();
          if (!client) return;
          // Vue2: ensure reactivity for new keys
          if (this.$set) {
            this.$set(this.contactsByPhone10, phone10, client);
          } else {
            this.contactsByPhone10[phone10] = client;
          }
        },
        getClientNameByPhone: function getClientNameByPhone(phone) {
          var phone10 = this.normalizePhone10(phone);
          return this.contactsByPhone10[phone10] || '';
        },
        getClientHeader: function getClientHeader(phone) {
          var client = this.getClientNameByPhone(phone);
          if (!client) return phone;
          return "".concat(client, " <").concat(phone, ">");
        },
        hasClientByPhone: function hasClientByPhone(phone) {
          return !!this.getClientNameByPhone(phone);
        },
        formatElapsedTime: function formatElapsedTime(enterTime) {
          return window[className].formatElapsedTime(enterTime);
        },
        normalizeAgentCards: function normalizeAgentCards() {
          var _this2 = this;
          if (!this.$el) return;

          // Cleanup artifacts from previous experiments (placeholders/spacers).
          var artifacts = this.$el.querySelectorAll('.agent-peer-placeholder, .agent-peer-spacer');
          artifacts.forEach(function (el) {
            return el.remove();
          });

          // Dense layout (masonry) that still fills left-to-right:
          // flex-wrap can't place items into vertical gaps under tall cards.
          this.ensureAgentCardsGridMasonry();

          // Prevent "equal height" cards in one row (Semantic UI cards are flex).
          var cardsContainer = this.$el.querySelector('.ui.cards.agent-cards');
          if (cardsContainer) {
            cardsContainer.style.alignItems = 'flex-start';
            cardsContainer.style.alignContent = 'flex-start';
          }
          var cards = this.$el.querySelectorAll('.ui.cards.agent-cards > .ui.card.agent-card');
          cards.forEach(function (card) {
            card.style.alignSelf = 'flex-start';
          });

          // Semantic UI makes .header bigger than normal text; we need same font size.
          var headers = this.$el.querySelectorAll('.ui.card.agent-card .header.agent-card-header');
          headers.forEach(function (el) {
            el.style.fontSize = '1em';
            el.style.lineHeight = '1.2';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.gap = '0.5em';
            el.style.whiteSpace = 'nowrap';
          });
          var metas = this.$el.querySelectorAll('.ui.card.agent-card .meta.agent-peer');
          metas.forEach(function (el) {
            el.style.fontSize = '1em';
            el.style.lineHeight = '1.2';
          });

          // Normalize label/name typography so they have same text height.
          var numLabels = this.$el.querySelectorAll('.ui.card.agent-card .agent-num-label');
          numLabels.forEach(function (el) {
            el.style.fontSize = '1em';
            el.style.lineHeight = '1.2';
            el.style.display = 'inline-flex';
            el.style.alignItems = 'center';
            el.style.paddingTop = '0';
            el.style.paddingBottom = '0';
            // Allow label to shrink (otherwise long numbers force card wider than 180px)
            el.style.flex = '0 1 auto';
            el.style.minWidth = '0';
            el.style.maxWidth = '14ch';
            el.style.overflow = 'hidden';
            el.style.textOverflow = 'ellipsis';
            el.style.whiteSpace = 'nowrap';
          });
          var names = this.$el.querySelectorAll('.ui.card.agent-card .agent-name');
          names.forEach(function (el) {
            el.style.lineHeight = '1.2';
            // Ellipsis for long names (e.g. "Салтыков-Щедрин")
            el.style.minWidth = '0';
            el.style.flex = '1 1 auto';
            el.style.overflow = 'hidden';
            el.style.textOverflow = 'ellipsis';
            el.style.whiteSpace = 'nowrap';
          });

          // Grid masonry needs row-span calculation after layout.
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              _this2.layoutAgentCardsGridMasonry();
            });
          });
        },
        adjustAgentCardsGap: function adjustAgentCardsGap() {
          if (!this.$el) return;
          var container = this.$el.querySelector('.ui.cards.agent-cards');
          if (!container) return;
          var cards = Array.from(container.querySelectorAll('.ui.card.agent-card'));
          if (!cards.length) return;
          var tallCard = cards.find(function (c) {
            return c.querySelector('.meta.agent-peer');
          });
          var shortCard = cards.find(function (c) {
            return !c.querySelector('.meta.agent-peer');
          });
          if (!tallCard || !shortCard) return;
          var ht = tallCard.getBoundingClientRect().height;
          var hs = shortCard.getBoundingClientRect().height;
          if (!ht || !hs) return;

          // From 2*(hs+g) = ht+g => g = ht - 2*hs
          var gap = ht - 2 * hs;
          if (!Number.isFinite(gap)) return;

          // Clamp to sane range; negative means "no extra gap needed".
          gap = Math.max(0, Math.min(20, Math.round(gap)));
          container.style.setProperty('--agent-card-gap', "".concat(gap, "px"));
        },
        adjustAgentCardsColumnCount: function adjustAgentCardsColumnCount() {
          if (!this.$el) return;
          var container = this.$el.querySelector('.ui.cards.agent-cards.agent-cards-masonry');
          if (!container) return;
          var w = container.clientWidth;
          if (!w) return;

          // Minimum acceptable card width in px (tune if needed)
          var minCardWidth = 150;
          var cs = window.getComputedStyle(container);
          var gapRaw = cs.columnGap || cs.getPropertyValue('column-gap') || '16px';
          var gapPx = parseFloat(gapRaw) || 16;
          var count = Math.max(1, Math.min(12, Math.floor((w + gapPx) / (minCardWidth + gapPx))));
          container.style.setProperty('--agent-card-col-count', String(count));
        },
        ensureAgentCardsGridMasonry: function ensureAgentCardsGridMasonry() {
          var _this3 = this;
          var styleId = 'agent-cards-layout-style';
          var styleEl = document.getElementById(styleId);
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
          }

          // Grid masonry: fills left-to-right and can pack items into gaps.
          styleEl.textContent = "\n.ui.cards.agent-cards.agent-cards-grid {\n  display: grid !important;\n  grid-template-columns: repeat(auto-fill, 240px);\n  justify-content: start;\n  gap: var(--agent-card-gap, 8px);\n  grid-auto-rows: 1px;\n  /* Prevent overlap with the legend block below */\n  margin-bottom: 1em !important;\n}\n.ui.cards.agent-cards.agent-cards-grid > .ui.card.agent-card {\n  width: 240px !important;\n  margin: 0 !important;\n  overflow: hidden;\n  /* reset from previous layouts */\n  align-self: start;\n}\n\t\t\t\t\t".trim();
          var cardsContainer = this.$el && this.$el.querySelector ? this.$el.querySelector('.ui.cards.agent-cards') : null;
          if (cardsContainer) {
            cardsContainer.classList.remove('agent-cards-masonry');
            cardsContainer.classList.remove('agent-cards-flex');
            cardsContainer.classList.add('agent-cards-grid');

            // Bind once: relayout on resize.
            if (!this._agentCardsResizeBound) {
              this._agentCardsResizeBound = true;
              window.addEventListener('resize', function () {
                _this3.layoutAgentCardsGridMasonry();
              });
            }
          }
        },
        layoutAgentCardsGridMasonry: function layoutAgentCardsGridMasonry() {
          if (!this.$el) return;
          var grid = this.$el.querySelector('.ui.cards.agent-cards.agent-cards-grid');
          if (!grid) return;
          var cs = window.getComputedStyle(grid);
          var rowHeight = parseFloat(cs.getPropertyValue('grid-auto-rows')) || 1;
          var rowGap = parseFloat(cs.getPropertyValue('row-gap')) || parseFloat(cs.getPropertyValue('gap')) || 8;
          var items = Array.from(grid.querySelectorAll('.ui.card.agent-card'));
          if (!items.length) return;

          // Reset row spans and min-heights to measure natural heights.
          items.forEach(function (item) {
            item.style.gridRowEnd = '';
            item.style.minHeight = '';
          });
          var tall = items.filter(function (c) {
            return c.querySelector('.meta.agent-peer');
          });
          var _short = items.filter(function (c) {
            return !c.querySelector('.meta.agent-peer');
          });

          // If we don't have both types, just do normal masonry spans.
          if (!tall.length || !_short.length) {
            items.forEach(function (item) {
              var h = item.getBoundingClientRect().height;
              var span = Math.max(1, Math.ceil((h + rowGap) / (rowHeight + rowGap)));
              item.style.gridRowEnd = "span ".concat(span);
            });
            return;
          }
          var hs = Math.max.apply(Math, _toConsumableArray(_short.map(function (c) {
            return c.getBoundingClientRect().height;
          })));
          var ht = Math.max.apply(Math, _toConsumableArray(tall.map(function (c) {
            return c.getBoundingClientRect().height;
          })));

          // Want: 2*(hs + g) = (ht + g)  => g = ht - 2*hs
          var g = ht - 2 * hs;
          if (!Number.isFinite(g)) g = rowGap;
          g = Math.max(0, Math.min(24, Math.round(g)));

          // Apply gap and enforce min-heights so the relation holds visually.
          grid.style.setProperty('--agent-card-gap', "".concat(g, "px"));
          var shortH = Math.round(hs);
          var tallH = Math.round(Math.max(ht, 2 * hs + g));
          _short.forEach(function (c) {
            c.style.minHeight = "".concat(shortH, "px");
          });
          tall.forEach(function (c) {
            c.style.minHeight = "".concat(tallH, "px");
          });

          // Now compute row spans from final rendered heights.
          var effectiveGap = g;
          items.forEach(function (item) {
            var h = item.getBoundingClientRect().height;
            var span = Math.max(1, Math.ceil((h + effectiveGap) / (rowHeight + effectiveGap)));
            item.style.gridRowEnd = "span ".concat(span);
          });
        },
        getSrcNumForAgent: function getSrcNumForAgent(agentNumber) {
          var result = '-';
          var answeredFound = false;
          var _iterator = _createForOfIteratorHelper(this.calls),
            _step;
          try {
            for (_iterator.s(); !(_step = _iterator.n()).done;) {
              var call = _step.value;
              if (call.dst_num === agentNumber) {
                answeredFound = true;
                result = call.src_num;
                break;
              }
              if (call.calledChannels && Array.isArray(call.calledChannels)) {
                var _match2 = call.calledChannels.find(function (ch) {
                  return ch.number === agentNumber;
                });
                if (_match2) {
                  result = call.src_num;
                }
              }
              if (call.bridgeChannels && Array.isArray(call.bridgeChannels)) {
                var _match3 = call.bridgeChannels.find(function (ch) {
                  return ch.src_num === agentNumber || ch.dst_num === agentNumber;
                });
                if (_match3) {
                  if (_match3.src_num === agentNumber) {
                    result = _match3.dst_num;
                  } else {
                    result = _match3.src_num;
                  }
                  answeredFound = true;
                }
              }
            }
          } catch (err) {
            _iterator.e(err);
          } finally {
            _iterator.f();
          }
          if (answeredFound === false) {
            for (var i = 0; i < this.allCalls.length; i++) {
              var tmpCall = this.allCalls[i];
              if (tmpCall.src_num === agentNumber) {
                // Исходящий
                if (tmpCall.dst_num === '') {
                  // не ответа, дозвон.
                  if (tmpCall.calledChannels && Array.isArray(tmpCall.calledChannels) && tmpCall.calledChannels.length) {
                    var match = tmpCall.calledChannels.find(function (ch) {
                      return ch.number !== agentNumber;
                    });
                    if (match) {
                      result = match.number;
                    }
                  } else if (tmpCall.spyer) {
                    // шпионит за номером.
                    result = tmpCall.spy_num;
                  } else {
                    // нет вызываемых каналов, возможно это вызов на приложение / ivr.
                    result = tmpCall.exten;
                  }
                } else {
                  result = tmpCall.dst_num;
                }
                break;
              } else if (tmpCall.dst_num === agentNumber) {
                // Входящий на агента, отвечен.
                result = tmpCall.src_num;
                break;
              } else {
                if (tmpCall.calledChannels && Array.isArray(tmpCall.calledChannels)) {
                  var _match = tmpCall.calledChannels.find(function (ch) {
                    return ch.number === agentNumber;
                  });
                  if (_match) {
                    result = tmpCall.src_num;
                  }
                }
              }
            }
          }
          return result;
        },
        hasPeerPhone: function hasPeerPhone(agentNumber) {
          var phone = String(this.getSrcNumForAgent(agentNumber) || '').trim();
          return phone !== '' && phone !== '-' && phone !== '—';
        },
        getPeerPhoneLabel: function getPeerPhoneLabel(agentNumber) {
          var phone = String(this.getSrcNumForAgent(agentNumber) || '').trim();
          return this.hasPeerPhone(agentNumber) ? phone : '—';
        },
        getPeerNameLabel: function getPeerNameLabel(agentNumber) {
          // Use cached contacts (WS + IndexedDB) to show client name for peer phone.
          var phone = this.getPeerPhoneLabel(agentNumber);
          var client = this.getClientNameByPhone(phone);
          return client || '—';
        }
      },
      data: {
        "minWaitVisible": 30,
        "name": "",
        "number": "",
        "queues": [],
        "agents": {},
        "agentsList": [],
        "contactsByPhone10": {},
        "calls": []
      }
    });
    window[className].applyContactsCacheToQueueWidget();
    window[className].$callsWidget = new Vue({
      el: '#calls',
      delimiters: ["<%", "%>"],
      data: {
        "minWaitVisible": 30,
        userNumber: userNumber,
        fullAccess: $('#fullAccess').val() === "1" || userNumber === '',
        calls: []
      },
      methods: {
        callIsVisible: function callIsVisible(call) {
          if (call.dst_chan === '' && call.queueData.EnterTime !== undefined) {
            return this.minWaitVisible <= this.getWaitTime(call);
          }
          return true;
        },
        formatTimestampToTime: function formatTimestampToTime(timestamp) {
          // Если timestamp строка — приводим к числу
          var ts = typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp;

          // Если timestamp в секундах (меньше 1e10), умножаем на 1000
          var ms = ts < 1e10 ? ts * 1000 : ts;
          var date = new Date(ms);
          var hours = String(date.getHours()).padStart(2, '0');
          var minutes = String(date.getMinutes()).padStart(2, '0');
          var seconds = String(date.getSeconds()).padStart(2, '0');
          return "".concat(hours, ":").concat(minutes, ":").concat(seconds);
        },
        getWaitTime: function getWaitTime(call) {
          var answer = Math.floor(Date.now() / 1000);
          if (call.answer !== '') {
            answer = call.answer;
          }
          return window[className].secondToTime(answer - call.start);
        },
        getCallTime: function getCallTime(call) {
          if (call.answer === '') {
            return '-';
          }
          return window[className].formatElapsedTime(call.answer);
        },
        updatedCallsFromResponse: function updatedCallsFromResponse(data) {
          this.minWaitVisible = 1 * $('#minWaitVisibleValue').val();
          // Проходим по всем очередям
          for (var queueId in data.queues) {
            var queue = data.queues[queueId];
            // Проверяем, есть ли у очереди поле calls и является ли оно массивом
            if (Array.isArray(queue.calls)) {
              var _data$calls;
              // Добавляем все вызовы из этой очереди в общий массив
              (_data$calls = data.calls).push.apply(_data$calls, _toConsumableArray(queue.calls));
            }
          }
          this.calls = data.calls;
          this.$nextTick(function () {
            Extensions.updatePhonesRepresent('need-update');
          });
        },
        formatElapsedTime: function formatElapsedTime(enterTime) {
          return window[className].formatElapsedTime(enterTime);
        },
        getClientHeader: function getClientHeader(phone) {
          var q = window[className].$widgetQueues;
          if (q && typeof q.getClientHeader === 'function') {
            return q.getClientHeader(phone);
          }
          return phone;
        },
        hangupAction: function hangupAction(event) {
          var target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          window[className].executeCallAction({
            action: 'hangup',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2')
          });
        },
        joinAction: function joinAction(event) {
          var target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          window[className].executeCallAction({
            action: 'join',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2'),
            number: this.userNumber
          });
        },
        whisperAction: function whisperAction(event) {
          var target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          var spChannel = target.attr('data-ch1');
          if ('incoming' === target.attr('data-call-type')) {
            spChannel = target.attr('data-ch2');
          }
          window[className].executeCallAction({
            action: 'whisper',
            ch1: spChannel,
            ch2: '',
            number: this.userNumber
          });
        },
        listenAction: function listenAction(event) {
          var target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          window[className].executeCallAction({
            action: 'listen',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2'),
            number: this.userNumber
          });
        }
      }
    });
    window[className].$widget = new Vue({
      el: '#app',
      delimiters: ["<%", "%>"],
      data: {
        userNumber: userNumber,
        fullAccess: $('#fullAccess').val() === "1" || userNumber === '',
        calls: []
      },
      methods: {
        updatedCallsFromResponse: function updatedCallsFromResponse(lines) {
          this.calls = lines;
          this.$nextTick(function () {
            Extensions.updatePhonesRepresent('need-update');
          });
        },
        hangupAction: function hangupAction(event) {
          var target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          window[className].executeCallAction({
            action: 'hangup',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2')
          });
        },
        joinAction: function joinAction(event) {
          var target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          window[className].executeCallAction({
            action: 'join',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2'),
            number: this.userNumber
          });
        },
        whisperAction: function whisperAction(event) {
          var target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          var spChannel = target.attr('data-ch1');
          if ('incoming' === target.attr('data-call-type')) {
            spChannel = target.attr('data-ch2');
          }
          window[className].executeCallAction({
            action: 'whisper',
            ch1: spChannel,
            ch2: '',
            number: this.userNumber
          });
        },
        listenAction: function listenAction(event) {
          var target = $(event.target);
          if (target.attr('data-ch1') === undefined) {
            target = $(event.target).parent();
          }
          if (this.userNumber === '') {
            return;
          }
          window[className].executeCallAction({
            action: 'listen',
            ch1: target.attr('data-ch1'),
            ch2: target.attr('data-ch2'),
            number: this.userNumber
          });
        }
      }
    });
    window[className].$checkBoxes.checkbox();
    window[className].$dropDowns.dropdown();
    window[className].initializeForm();
    $('.menu .item').tab();
    //////
    // Удаляем отступы контейнера.
    $('#main-content-container').removeClass('container');
    $('#module-status-toggle-segment').hide();
    $('.ui.clearing.hidden.divider').remove();
    // Окончание форматирования базовой страницы
    //////
    window[className].updateLines();
    setInterval(window[className].updateLines, 2000);
  },
  initContactsCache: function initContactsCache() {
    var _this4 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
      var _t;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.p = _context.n) {
          case 0:
            _context.p = 0;
            _context.n = 1;
            return _this4.idbLoadAllContacts();
          case 1:
            _this4._contactsCacheByPhone10 = _context.v;
            _this4.applyContactsCacheToQueueWidget();
            _context.n = 3;
            break;
          case 2:
            _context.p = 2;
            _t = _context.v;
            console.log('contacts cache init error', _t);
            _this4._contactsCacheByPhone10 = {};
          case 3:
            return _context.a(2);
        }
      }, _callee, null, [[0, 2]]);
    }))();
  },
  applyContactsCacheToQueueWidget: function applyContactsCacheToQueueWidget() {
    if (!this._contactsCacheByPhone10) return;
    if (!window[className].$widgetQueues) return;
    for (var _i2 = 0, _Object$entries = Object.entries(this._contactsCacheByPhone10); _i2 < _Object$entries.length; _i2++) {
      var _Object$entries$_i = _slicedToArray(_Object$entries[_i2], 2),
        phone10 = _Object$entries$_i[0],
        client = _Object$entries$_i[1];
      if (window[className].$widgetQueues.$set) {
        window[className].$widgetQueues.$set(window[className].$widgetQueues.contactsByPhone10, phone10, client);
      } else {
        window[className].$widgetQueues.contactsByPhone10[phone10] = client;
      }
    }
  },
  idbOpenContactsDb: function idbOpenContactsDb() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open('ModuleMonitorActiveCalls', 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('contactsByPhone10')) {
            db.createObjectStore('contactsByPhone10', {
              keyPath: 'phone10'
            });
          }
        };
        req.onsuccess = function () {
          return resolve(req.result);
        };
        req.onerror = function () {
          return reject(req.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  },
  idbPutContact: function idbPutContact(phone10, client) {
    var _this5 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
      var db;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            _context2.n = 1;
            return _this5.idbOpenContactsDb();
          case 1:
            db = _context2.v;
            return _context2.a(2, new Promise(function (resolve, reject) {
              var tx = db.transaction('contactsByPhone10', 'readwrite');
              var store = tx.objectStore('contactsByPhone10');
              store.put({
                phone10: phone10,
                client: client,
                updatedAt: Date.now()
              });
              tx.oncomplete = function () {
                db.close();
                resolve();
              };
              tx.onerror = function () {
                var err = tx.error;
                db.close();
                reject(err);
              };
            }));
        }
      }, _callee2);
    }))();
  },
  idbLoadAllContacts: function idbLoadAllContacts() {
    var _this6 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
      var db;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.n) {
          case 0:
            _context3.n = 1;
            return _this6.idbOpenContactsDb();
          case 1:
            db = _context3.v;
            return _context3.a(2, new Promise(function (resolve, reject) {
              var tx = db.transaction('contactsByPhone10', 'readwrite');
              var store = tx.objectStore('contactsByPhone10');
              var req = store.getAll();
              req.onsuccess = function () {
                var map = {};
                var now = Date.now();
                var ttlMs = Number(_this6.contactsCacheTtlMs) || 120 * 60 * 1000;
                var _iterator2 = _createForOfIteratorHelper(req.result || []),
                  _step2;
                try {
                  for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
                    var row = _step2.value;
                    var phone10 = row === null || row === void 0 ? void 0 : row.phone10;
                    var client = row === null || row === void 0 ? void 0 : row.client;
                    var updatedAt = Number(row === null || row === void 0 ? void 0 : row.updatedAt) || 0;
                    var isFresh = phone10 && client && updatedAt > 0 && now - updatedAt <= ttlMs;
                    if (isFresh) {
                      map[phone10] = client;
                    } else if (phone10) {
                      // Cleanup expired/broken records
                      try {
                        store["delete"](phone10);
                      } catch (e) {/* ignore */}
                    }
                  }
                } catch (err) {
                  _iterator2.e(err);
                } finally {
                  _iterator2.f();
                }
                tx.oncomplete = function () {
                  db.close();
                  resolve(map);
                };
                tx.onerror = function () {
                  var err = tx.error;
                  db.close();
                  reject(err);
                };
              };
              req.onerror = function () {
                var err = req.error;
                db.close();
                reject(err);
              };
            }));
        }
      }, _callee3);
    }))();
  },
  requestBackendEnable: function requestBackendEnable() {
    $.api({
      url: window[className].backendEnableUrl,
      on: 'now',
      method: 'POST',
      onSuccess: function onSuccess(response) {
        var _response$data, _response$data2;
        console.log('backandEnable response', response);
        var accessToken = response === null || response === void 0 || (_response$data = response.data) === null || _response$data === void 0 ? void 0 : _response$data.access_token;
        var refreshToken = response === null || response === void 0 || (_response$data2 = response.data) === null || _response$data2 === void 0 ? void 0 : _response$data2.refresh_token;
        if (accessToken && refreshToken) {
          window[className].setAuthTokens(accessToken, refreshToken);
          window[className].connectContactsWs();
        }
      },
      onFailure: function onFailure(response) {
        console.log('backandEnable failure', response);
      },
      onError: function onError(errorMessage, element, xhr) {
        console.log('backandEnable error', errorMessage, xhr);
      }
    });
  },
  setAuthTokens: function setAuthTokens(accessToken, refreshToken) {
    this._authTokens = this._authTokens || {};
    this._authTokens.access_token = accessToken;
    this._authTokens.refresh_token = refreshToken;
    this._authTokens.exp = this.getJwtExp(accessToken);
  },
  getJwtExp: function getJwtExp(token) {
    try {
      if (!token || typeof token !== 'string') return 0;
      var parts = token.split('.');
      if (parts.length < 2) return 0;
      var payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      var padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
      var json = atob(padded);
      var payload = JSON.parse(json);
      return Number(payload === null || payload === void 0 ? void 0 : payload.exp) || 0;
    } catch (e) {
      return 0;
    }
  },
  isAccessTokenExpired: function isAccessTokenExpired() {
    var _this$_authTokens;
    var skewSeconds = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var exp = Number((_this$_authTokens = this._authTokens) === null || _this$_authTokens === void 0 ? void 0 : _this$_authTokens.exp) || 0;
    if (!exp) return false; // unknown exp -> don't force refresh
    var now = Math.floor(Date.now() / 1000);
    return now + skewSeconds >= exp;
  },
  scheduleContactsWsTokenRefresh: function scheduleContactsWsTokenRefresh() {
    var _this$_authTokens2,
      _this7 = this;
    // Proactively refresh token shortly before expiry by re-requesting backendEnable.
    if (this._contactsWsTokenTimer) {
      clearTimeout(this._contactsWsTokenTimer);
      this._contactsWsTokenTimer = null;
    }
    var exp = Number((_this$_authTokens2 = this._authTokens) === null || _this$_authTokens2 === void 0 ? void 0 : _this$_authTokens2.exp) || 0;
    if (!exp) return;
    var now = Math.floor(Date.now() / 1000);
    var refreshInSec = Math.max(1, exp - now - 15); // 15s before exp
    this._contactsWsTokenTimer = setTimeout(function () {
      // Re-get tokens and reconnect WS
      _this7.requestBackendEnable();
    }, refreshInSec * 1000);
  },
  scheduleContactsWsReconnect: function scheduleContactsWsReconnect(reason) {
    var _this8 = this;
    var forceReAuth = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    if (this._contactsWsReconnectTimer) {
      clearTimeout(this._contactsWsReconnectTimer);
      this._contactsWsReconnectTimer = null;
    }
    this._contactsWsReconnectAttempt = (this._contactsWsReconnectAttempt || 0) + 1;
    var delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, this._contactsWsReconnectAttempt - 1)));
    this._contactsWsReconnectTimer = setTimeout(function () {
      if (forceReAuth || _this8.isAccessTokenExpired(5)) {
        _this8.requestBackendEnable();
      } else {
        _this8.connectContactsWs();
      }
    }, delay);
    console.log('contacts ws reconnect scheduled', {
      reason: reason,
      delayMs: delay
    });
  },
  connectContactsWs: function connectContactsWs() {
    var _this9 = this;
    try {
      var _this$_authTokens3;
      var accessToken = (_this$_authTokens3 = this._authTokens) === null || _this$_authTokens3 === void 0 ? void 0 : _this$_authTokens3.access_token;
      if (!accessToken) return;

      // Avoid reconnecting if already connected/connecting
      if (this._contactsWs && (this._contactsWs.readyState === WebSocket.OPEN || this._contactsWs.readyState === WebSocket.CONNECTING)) {
        return;
      }
      // Reset backoff on explicit connect attempt
      this._contactsWsReconnectAttempt = 0;
      var wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      var wsHost = window.location.host; // host:port of current page
      var tokenParam = encodeURIComponent(accessToken);
      var wsUrl = "".concat(wsProto, "://").concat(wsHost, "/pbxcore/api/module-softphone-backend/v1/sub/contacts?authorization=").concat(tokenParam);
      this._contactsWs = new WebSocket(wsUrl);
      this._contactsWs.onopen = function () {
        console.log('contacts ws connected');
        _this9.scheduleContactsWsTokenRefresh();
      };
      this._contactsWs.onmessage = function (event) {
        _this9.handleContactsWsMessage(event === null || event === void 0 ? void 0 : event.data);
      };
      this._contactsWs.onerror = function (event) {
        console.log('contacts ws error', event);
      };
      this._contactsWs.onclose = function (event) {
        var code = event === null || event === void 0 ? void 0 : event.code;
        var reason = event === null || event === void 0 ? void 0 : event.reason;
        console.log('contacts ws closed', {
          code: code,
          reason: reason
        });
        if (_this9._contactsWsTokenTimer) {
          clearTimeout(_this9._contactsWsTokenTimer);
          _this9._contactsWsTokenTimer = null;
        }

        // 1000 = normal close -> reconnect; auth closes vary by server implementation.
        var authCloseCodes = new Set([1008, 4001, 4401, 4403]);
        var forceReAuth = authCloseCodes.has(code) || _this9.isAccessTokenExpired(0);
        _this9.scheduleContactsWsReconnect('close', forceReAuth);
      };
    } catch (e) {
      console.log('contacts ws init error', e);
      this.scheduleContactsWsReconnect('init_error', this.isAccessTokenExpired(0));
    }
  },
  handleContactsWsMessage: function handleContactsWsMessage(data) {
    try {
      if (!data) return;
      var parsed = typeof data === 'string' ? JSON.parse(data) : data;
      var items = Array.isArray(parsed) ? parsed : [parsed];
      var _iterator3 = _createForOfIteratorHelper(items),
        _step3;
      try {
        for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
          var item = _step3.value;
          var digits = String((item === null || item === void 0 ? void 0 : item.number) || '').replace(/\D+/g, '');
          var phone10 = digits.length <= 10 ? digits : digits.slice(-10);
          var client = String((item === null || item === void 0 ? void 0 : item.client) || '').trim();
          if (phone10 && client) {
            this._contactsCacheByPhone10 = this._contactsCacheByPhone10 || {};
            this._contactsCacheByPhone10[phone10] = client;
            this.idbPutContact(phone10, client)["catch"](function (e) {
              return console.log('contacts cache save error', e);
            });
          }
          if (window[className].$widgetQueues) {
            window[className].$widgetQueues.updateContactFromWs(item);
          }
        }
      } catch (err) {
        _iterator3.e(err);
      } finally {
        _iterator3.f();
      }
    } catch (e) {
      console.log('contacts ws parse error', e);
    }
  },
  formatElapsedTime: function formatElapsedTime(enterTime) {
    if (!enterTime) return '—';
    var now = Math.floor(Date.now() / 1000);
    var diffSeconds = now - enterTime;
    return window[className].secondToTime(diffSeconds);
  },
  secondToTime: function secondToTime(diffSeconds) {
    if (diffSeconds < 0) return '0';
    // Форматируем: чч:мм:сс или мм:сс, или просто секунды
    var hours = Math.floor(diffSeconds / 3600);
    var minutes = Math.floor(diffSeconds % 3600 / 60);
    var seconds = Math.round(diffSeconds % 60);
    if (hours > 0) {
      return "".concat(hours, ":").concat(minutes.toString().padStart(2, '0'), ":").concat(seconds.toString().padStart(2, '0'));
    } else if (minutes > 0) {
      return "".concat(minutes, ":").concat(seconds.toString().padStart(2, '0'));
    } else {
      return "".concat(seconds);
    }
  },
  onChangeSetting: function onChangeSetting(settingName, value) {
    if (window[className].isInit) {
      return;
    }
    var data = _defineProperty({}, settingName, value);
    $.api({
      url: window[className].saveUserActionUrl,
      on: 'now',
      method: 'POST',
      data: data,
      successTest: function successTest(response) {
        return response !== undefined && Object.keys(response).length > 0 && response.success === true;
      },
      onSuccess: function onSuccess(response) {
        if (settingName === 'queueId') {
          $('#queueId').val($(window[className].queueNameSelector).dropdown('get value'));
        } else if (settingName === 'adminUserId') {
          window.location.href = window.location.href;
        }
      },
      onFailure: function onFailure(response) {
        console.log(response);
      },
      onError: function onError(errorMessage, element, xhr) {
        console.log(errorMessage, xhr);
      }
    });
  },
  executeCallAction: function executeCallAction(data) {
    $.api({
      url: window[className].executeCallUrl,
      on: 'now',
      method: 'POST',
      data: data,
      successTest: function successTest(response) {
        return response !== undefined && Object.keys(response).length > 0 && response.success === true;
      },
      onSuccess: function onSuccess(response) {
        console.log(response);
      },
      onFailure: function onFailure(response) {
        console.log(response);
      },
      onError: function onError(errorMessage, element, xhr) {
        console.log(errorMessage, xhr);
      }
    });
  },
  updateLines: function updateLines() {
    $.api({
      url: window[className].activeChannelsUrlV2,
      on: 'now',
      method: 'POST',
      successTest: function successTest(response) {
        return response !== undefined && Object.keys(response).length > 0 && response.success === true;
      },
      onSuccess: function onSuccess(response) {
        window[className].$widgetQueues.updatedCallsFromResponse(response);
        window[className].$callsWidget.updatedCallsFromResponse(response);
      },
      onFailure: function onFailure(response) {
        console.log(response);
      },
      onError: function onError(errorMessage, element, xhr) {
        console.log(errorMessage, xhr);
      }
    });
  },
  /**
   * We can modify some data before form send
   * @param settings
   * @returns {*}
   */
  cbBeforeSendForm: function cbBeforeSendForm(settings) {
    var result = settings;
    result.data = window[className].$formObj.form('get values');
    return result;
  },
  /**
   * Some actions after forms send
   */
  cbAfterSendForm: function cbAfterSendForm() {},
  /**
   * Initialize form parameters
   */
  initializeForm: function initializeForm() {
    Form.$formObj = window[className].$formObj;
    Form.url = "".concat(globalRootUrl).concat(idUrl, "/save");
    Form.validateRules = window[className].validateRules;
    Form.cbBeforeSendForm = window[className].cbBeforeSendForm;
    Form.cbAfterSendForm = window[className].cbAfterSendForm;
    Form.initialize();
  }
};
$(document).ready(function () {
  window[className].initialize();
});
//# sourceMappingURL=module-monitor-active-calls-index.js.map