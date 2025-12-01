"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
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
  queueNameSelector: '#app-queue div.scrolling.dropdown',
  $formObj: $('#' + idForm),
  $checkBoxes: $('#' + idForm + ' .ui.checkbox'),
  $dropDowns: $('#' + idForm + ' .ui.dropdown'),
  activeChannelsUrl: globalRootUrl + idUrl + "/getActiveChannels",
  activeChannelsUrlV2: globalRootUrl + idUrl + "/getActiveChannelsV2",
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
          var queueNameEl = $(window[className].queueNameSelector);
          this.minWaitVisible = 1 * $('#minWaitVisibleValue').val();
          this.queues = data.queues;
          var queueId = $('#queueId').val();
          if (queueId in data.queues) {
            this.id = data.queues[queueId].id;
            this.name = data.queues[queueId].name;
            this.number = data.queues[queueId].number;
            this.agents = data.queues[queueId].agents;
            this.calls = Array.isArray(data.queues[queueId].calls) ? data.queues[queueId].calls : [];
            this.allCalls = data.calls;
          } else {
            this.calls = [];
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
        },
        formatElapsedTime: function formatElapsedTime(enterTime) {
          return window[className].formatElapsedTime(enterTime);
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
        }
      },
      data: {
        "minWaitVisible": 30,
        "name": "",
        "number": "",
        "queues": [],
        "agents": {},
        "calls": []
      }
    });
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