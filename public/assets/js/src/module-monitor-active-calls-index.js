/*
 * Copyright (C) MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Nikolay Beketov, 11 2018
 *
 */
const idUrl     = 'module-monitor-active-calls';
const idForm    = 'module-monitor-active-calls-form';
const className = 'ModuleMonitorActiveCalls';
const inputClassName = 'mikopbx-module-input';

/* global $, globalRootUrl, globalTranslate, Form, Config, Vue, Extensions */
const ModuleMonitorActiveCalls = {
	isInit: true,
	queueNameSelector: '#app-queue div.scrolling.dropdown',
	$formObj: $('#'+idForm),
	$checkBoxes: $('#'+idForm+' .ui.checkbox'),
	$dropDowns: $('#'+idForm+' .ui.dropdown'),
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
	initialize() {
		$("#nowUser.dropdown.enable").dropdown({
			onChange: function onChange(value, text, $choice) {
				window[className].onChangeSetting('adminUserId', value);
			}
		});
		let userNumber = $('#userNumber').val();

		window[className].$widgetQueues = new Vue({
			el: '#app-queue',
			delimiters: ["<%","%>"],
			methods: {
				updatedCallsFromResponse(data) {
					let queueNameEl = $(window[className].queueNameSelector);

					this.queues = data.queues;
					let queueId = $('#queueId').val();
					if (queueId in data.queues) {
						this.id     = data.queues[queueId].id;
						this.name   = data.queues[queueId].name;
						this.number = data.queues[queueId].number;
						this.agents = data.queues[queueId].agents;
						this.calls  = Array.isArray(data.queues[queueId].calls) ? data.queues[queueId].calls : [];
						this.allCalls = data.calls;
					}else{
						this.calls  = [];
					}
					if(queueNameEl.dropdown('is hidden')){
						queueNameEl.dropdown({
							onChange: function onChange(value, text, $choice) {
								window[className].onChangeSetting('queueId', value);
							}
						});
						if(queueNameEl.dropdown('get value') === ''){
							window[className].isInit = true;
							queueNameEl.dropdown('set value', $('#queueId').val())
							window[className].isInit = false;
						}
					}
				},
				formatElapsedTime(enterTime) {
					return window[className].formatElapsedTime(enterTime);
				},
				getSrcNumForAgent(agentNumber) {
					let result = '-';
					let answeredFound  = false;
					for (const call of this.calls) {
						if(call.dst_num === agentNumber){
							answeredFound = true;
							result = call.src_num;
							break;
						}
						if (call.calledChannels && Array.isArray(call.calledChannels)) {
							const match = call.calledChannels.find(ch => ch.number === agentNumber);
							if (match) {
								result = call.src_num;
							}
						}
						if (call.bridgeChannels && Array.isArray(call.bridgeChannels)) {
							const match = call.bridgeChannels.find(ch => (ch.src_num === agentNumber || ch.dst_num === agentNumber));
							if (match) {
								if(match.src_num === agentNumber){
									result = match.dst_num;
								}else{
									result = match.src_num;
								}
								answeredFound = true;
							}
						}
					}
					if(answeredFound === false){
						for (let i = 0; i < this.allCalls.length; i++) {
							const tmpCall = this.allCalls[i];
							if(tmpCall.src_num === agentNumber){
								// Исходящий
								if(tmpCall.dst_num === ''){
									// не ответа, дозвон.
									if (tmpCall.calledChannels && Array.isArray(tmpCall.calledChannels) &&  tmpCall.calledChannels.length) {
										const match = tmpCall.calledChannels.find(ch => ch.number !== agentNumber);
										if (match) {
											result = match.number;
										}
									}else if(tmpCall.spyer){
										// шпионит за номером.
										result = tmpCall.spy_num;
									}else{
										// нет вызываемых каналов, возможно это вызов на приложение / ivr.
										result = tmpCall.exten;
									}
								}else{
									result = tmpCall.dst_num;
								}
								break;
							}else if(tmpCall.dst_num === agentNumber){
								// Входящий на агента, отвечен.
								result = tmpCall.src_num;
								break;
							}else{
								if (tmpCall.calledChannels && Array.isArray(tmpCall.calledChannels)) {
									const match = tmpCall.calledChannels.find(ch => ch.number === agentNumber);
									if (match) {
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
				"name": "",
				"number": "",
				"queues": [],
				"agents": {
				// 	"201": {
				// 		"state": "Ringing",
				// 		"name": "Алексей"
				// 	},
				// 	"202": {
				// 		"state": "Unavailable",
				// 		"name": "Техник"
				// 	},
				// 	"203": {
				// 		"state": "Ringing",
				// 		"name": "Иван"
				// 	}
				},
				"calls": [
				// 	{
				// 		"start": "1760937393.0",
				// 		"answer": "",
				// 		"typeCall": "incoming",
				// 		"src_chan": "PJSIP/SIP-1692280724-00000000",
				// 		"src_num": "74952293042",
				// 		"dst_chan": "",
				// 		"dst_num": "",
				// 		"did": "3333",
				// 		"linkedid": "mikopbx-1760937393.0",
				// 		"calledChannels": [
				// 			{
				// 				"channel": "PJSIP/203-00000001",
				// 				"number": "203"
				// 			},
				// 			{
				// 				"channel": "PJSIP/201-00000002",
				// 				"number": "201"
				// 			}
				// 		],
				// 		"queueData": {
				// 			"QueueID": "QUEUE-F38325E796B3FFB8938BA383AA119148",
				// 			"EnterTime": 1760937397
				// 		},
				// 		"lastQueue": "QUEUE-F38325E796B3FFB8938BA383AA119148"
				// 	},
				// 	{
				// 		"start": "1760937400.9",
				// 		"answer": "",
				// 		"typeCall": "incoming",
				// 		"src_chan": "PJSIP/SIP-1692280724-00000003",
				// 		"src_num": "74952293000",
				// 		"dst_chan": "",
				// 		"dst_num": "",
				// 		"did": "3333",
				// 		"linkedid": "mikopbx-1760937400.9",
				// 		"calledChannels": [],
				// 		"queueData": {
				// 			"QueueID": "QUEUE-F38325E796B3FFB8938BA383AA119148",
				// 			"EnterTime": 1760937400
				// 		},
				// 		"lastQueue": "QUEUE-F38325E796B3FFB8938BA383AA119148"
				// 	}
				]
			},
		});

		window[className].$callsWidget = new Vue({
			el: '#calls',
			delimiters: ["<%","%>"],
			data: {
				userNumber: userNumber,
				fullAccess: ($('#fullAccess').val() === "1" || userNumber === ''),
				calls: [
					// {
					// 	"start": "1761644078.56",
					// 	"answer": "",
					// 	"typeCall": "inner",
					// 	"src_chan": "PJSIP\/201-00000012",
					// 	"src_num": "201",
					// 	"exten": "",
					// 	"dst_chan": "",
					// 	"dst_num": "",
					// 	"did": "",
					// 	"linkedid": "mikopbx-1761644078.54",
					// 	"calledChannels": [],
					// 	"bridgeChannels": [],
					// 	"spyer": true,
					// 	"spy_num": "74952292344",
					// 	"spy_chan": "PJSIP\/SIP-1692280724-0000000d",
					// 	"queueData": [],
					// 	"lastQueue": ""
					// },
					// {
					// 	"start": "1761125329.175",
					// 	"answer": "1761125349.404022",
					// 	"typeCall": "incoming",
					// 	"src_chan": "PJSIP\/SIP-1692280724-0000003d",
					// 	"src_num": "74952293042",
					// 	"dst_chan": "PJSIP\\/201-00000040",
					// 	"dst_num": "201",
					// 	"did": "2233",
					// 	"linkedid": "mikopbx-1761125329.175",
					// 	"calledChannels": [
					// 		// {
					// 		// 	"channel": "PJSIP\/201-00000040",
					// 		// 	"number": "201",
					// 		// }
					// 	],
					// 	"bridgeChannels": [
					// 		// {
					// 		// 	"answer": "1761125503.702850",
					// 		// 	"src_chan": "PJSIP\/201-00000040",
					// 		// 	"src_num": "201",
					// 		// 	"dst_chan": "PJSIP\/203-00000041",
					// 		// 	"dst_num": "203"
					// 		// }
					// 	],
					// 	"queueData": [],
					// 	"lastQueue": "QUEUE-F38325E796B3FFB8938BA383AA119148"
					// }
				]
			},
			methods: {
				formatTimestampToTime(timestamp) {
					// Если timestamp строка — приводим к числу
					const ts = typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp;

					// Если timestamp в секундах (меньше 1e10), умножаем на 1000
					const ms = ts < 1e10 ? ts * 1000 : ts;

					const date = new Date(ms);

					const hours = String(date.getHours()).padStart(2, '0');
					const minutes = String(date.getMinutes()).padStart(2, '0');
					const seconds = String(date.getSeconds()).padStart(2, '0');

					return `${hours}:${minutes}:${seconds}`;
				},
				getWaitTime(call){
					let answer = Math.floor(Date.now() / 1000);
					if(call.answer !== ''){
						answer = call.answer
					}
					return window[className].secondToTime(answer - call.start);
				},
				getCallTime(call){
					if(call.answer === ''){
						return '-';
					}
					return window[className].formatElapsedTime(call.answer);
				},
				updatedCallsFromResponse(data) {
					// Проходим по всем очередям
					for (const queueId in data.queues) {
						const queue = data.queues[queueId];
						// Проверяем, есть ли у очереди поле calls и является ли оно массивом
						if (Array.isArray(queue.calls)) {
							// Добавляем все вызовы из этой очереди в общий массив
							data.calls.push(...queue.calls);
						}
					}
					this.calls = data.calls;
					this.$nextTick(() => {
						Extensions.updatePhonesRepresent('need-update');
					});
				},
				formatElapsedTime(enterTime) {
					return window[className].formatElapsedTime(enterTime);
				},
				hangupAction(event) {
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					window[className].executeCallAction({action: 'hangup', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2')});
				},
				joinAction(event) {
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					window[className].executeCallAction({action: 'join', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2'), number: this.userNumber});
				},
				whisperAction(event){
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					let spChannel = target.attr('data-ch1');
					if('incoming' === target.attr('data-call-type')){
						spChannel = target.attr('data-ch2');
					}
					window[className].executeCallAction({action: 'whisper', ch1: spChannel, ch2: '', number: this.userNumber});
				},
				listenAction(event){
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					window[className].executeCallAction({action: 'listen', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2'), number: this.userNumber});
				}
			}
		});

		window[className].$widget = new Vue({
			el: '#app',
			delimiters: ["<%","%>"],
			data: {
				userNumber: userNumber,
				fullAccess: ($('#fullAccess').val() === "1" || userNumber === ''),
				calls: [
					// {
					// 	src_num: "203",
					// 	src_chan: "PJSIP/203-00000007",
					// 	dst_num: "201",
					// 	dst_chan: 'PJSIP/201-00000008',
					// 	did: '74952293042',
					// 	uid: 'mikopbx-1719575091.11',
					// },
				]
			},
			methods: {
				updatedCallsFromResponse(lines) {
					this.calls = lines;
					this.$nextTick(() => {
						Extensions.updatePhonesRepresent('need-update');
					});
				},
				hangupAction(event) {
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					window[className].executeCallAction({action: 'hangup', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2')});
				},
				joinAction(event) {
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					window[className].executeCallAction({action: 'join', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2'), number: this.userNumber});
				},
				whisperAction(event){
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					let spChannel = target.attr('data-ch1');
					if('incoming' === target.attr('data-call-type')){
						spChannel = target.attr('data-ch2');
					}
					window[className].executeCallAction({action: 'whisper', ch1: spChannel, ch2: '', number: this.userNumber});
				},
				listenAction(event){
					let target = $(event.target);
					if(target.attr('data-ch1') === undefined){
						target = $(event.target).parent();
					}
					if(this.userNumber === ''){
						return;
					}
					window[className].executeCallAction({action: 'listen', ch1: target.attr('data-ch1'), ch2: target.attr('data-ch2'), number: this.userNumber});
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
	formatElapsedTime(enterTime) {
		if (!enterTime) return '—';

		const now = Math.floor(Date.now() / 1000);
		const diffSeconds = now - enterTime;

		return window[className].secondToTime(diffSeconds);
	},
	secondToTime(diffSeconds){
		if (diffSeconds < 0) return '0';
		// Форматируем: чч:мм:сс или мм:сс, или просто секунды
		const hours   = Math.floor(diffSeconds / 3600);
		const minutes = Math.floor((diffSeconds % 3600) / 60);
		const seconds = Math.round(diffSeconds % 60);
		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
		} else if (minutes > 0) {
			return `${minutes}:${seconds.toString().padStart(2, '0')}`;
		} else {
			return `${seconds}`;
		}
	},
	onChangeSetting(settingName, value) {
		if(window[className].isInit){
			return;
		}
		let data = {
			[settingName]: value
		};
		$.api({
			url: window[className].saveUserActionUrl,
			on: 'now',
			method: 'POST',
			data: data,
			successTest(response) {
				return response !== undefined && Object.keys(response).length > 0 && response.success === true;
			},
			onSuccess(response) {
				if(settingName === 'queueId'){
					$('#queueId').val($(window[className].queueNameSelector).dropdown('get value'));
				}else if( settingName === 'adminUserId'){
					window.location.href = window.location.href;
				}
			},
			onFailure(response) {
				console.log(response);
			},
			onError(errorMessage, element, xhr) {
				console.log(errorMessage,xhr);
			}
		});
	},
	executeCallAction(data) {
		$.api({
			url: window[className].executeCallUrl,
			on: 'now',
			method: 'POST',
			data: data,
			successTest(response) {
				return response !== undefined && Object.keys(response).length > 0 && response.success === true;
			},
			onSuccess(response) {
				console.log(response);
			},
			onFailure(response) {
				console.log(response);
			},
			onError(errorMessage, element, xhr) {
				console.log(errorMessage,xhr);
			}
		});
	},
	updateLines() {
		// $.api({
		// 	url: window[className].activeChannelsUrl,
		// 	on: 'now',
		// 	method: 'POST',
		// 	successTest(response) {
		// 		return response !== undefined && Object.keys(response).length > 0 && response.success === true;
		// 	},
		// 	onSuccess(response) {
		// 		window[className].$widget.updatedCallsFromResponse(response.lines);
		// 	},
		// 	onFailure(response) {
		// 		console.log(response);
		// 	},
		// 	onError(errorMessage, element, xhr) {
		// 		console.log(errorMessage,xhr);
		// 	}
		// });

		$.api({
			url: window[className].activeChannelsUrlV2,
			on: 'now',
			method: 'POST',
			successTest(response) {
				return response !== undefined && Object.keys(response).length > 0 && response.success === true;
			},
			onSuccess(response) {
				window[className].$widgetQueues.updatedCallsFromResponse(response);
				window[className].$callsWidget.updatedCallsFromResponse(response);
			},
			onFailure(response) {
				console.log(response);
			},
			onError(errorMessage, element, xhr) {
				console.log(errorMessage,xhr);
			}
		});
	},

	/**
	 * We can modify some data before form send
	 * @param settings
	 * @returns {*}
	 */
	cbBeforeSendForm(settings) {
		const result = settings;
		result.data = window[className].$formObj.form('get values');
		return result;
	},
	/**
	 * Some actions after forms send
	 */
	cbAfterSendForm() {

	},
	/**
	 * Initialize form parameters
	 */
	initializeForm() {
		Form.$formObj = window[className].$formObj;
		Form.url = `${globalRootUrl}${idUrl}/save`;
		Form.validateRules = window[className].validateRules;
		Form.cbBeforeSendForm = window[className].cbBeforeSendForm;
		Form.cbAfterSendForm = window[className].cbAfterSendForm;
		Form.initialize();
	},
};

$(document).ready(() => {
	window[className].initialize();
});

