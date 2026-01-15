
<input id="username" type="hidden" value="{{ username }}">
<input id="cid" type="hidden" value="{{ cid }}">
<input id="userNumber" type="hidden" value="{{ userNumber }}">
<input id="userRestrictions" type="hidden" value="{{ userRestrictions }}">
<input id="roleName" type="hidden" value="{{ roleName }}">
<input id="fullAccess" type="hidden" value="{{ fullAccess }}">
<input id="session" type="hidden" value="{{ session }}">
<input id="queueId" type="hidden" value="{{ queueId }}">
<input id="minWaitVisibleValue" type="hidden" value="{{ minWaitVisibleValue }}">

{% if cid !== "" %}
    <div class="ui label">
      {{ t._('module_monitorCalls_CidTitle') }}:
      <div class="ui dropdown">
         <div class="detail">{{ cid }}</div>
      </div>
    </div>
{% endif %}

<div class="ui label" data-tooltip="{{ t._('module_monitorCalls_userNumberHelpMessage') }}">
  {{ t._('module_monitorCalls_userNumberTitle') }}:
  <div class="ui dropdown">
    {% if userNumber !== "" %}
      {{ userNumber }}
    {% else %}
      {{ t._('module_monitorCalls_userNumberNotFound') }}
    {% endif %}
  </div>
</div>

<!-- <div class="ui label"> -->
<!--   {{ t._('module_monitorCalls_LoginTitle') }}: -->
<!--   <div class="detail">{{ username }}</div> -->
<!-- </div> -->

<div class="ui label">
  {{ t._('module_monitorCalls_LoginTitle') }}:
  <div id="nowUser" class="ui scrolling dropdown {% if isRootUser %} enable {% endif %}">
      <div class="text">{{roleName}}</div>
      {% if isRootUser %}
      <i class="dropdown icon"></i>
      {% endif %}
      <div class="menu">
        {% for user in usersArray %}
            <div class="item" data-value="{{user['id']}}" data-text="{{user['username']}}">{{user['username']}}</div>
        {% endfor %}
      </div>
  </div>
</div>

<div class="ui label">
  {{ t._('module_monitorCalls_minWaitVisible') }}:
  <div id="minWaitVisible" class="ui scrolling dropdown {% if isRootUser %} enable {% endif %}">
      <div class="text">{{minWaitVisibleValue}}</div>
      <i class="dropdown icon"></i>
      <div class="menu">
        {% for variant in minWaitVisible %}
            <div class="item {% if variant['active'] %} active selected {% endif %}" data-value="{{variant['id']}}" data-text="{{variant['name']}}">{{variant['name']}}</div>
        {% endfor %}
      </div>
  </div>
</div>

<br>
<br>
<div id="app-queue" class="ui">
    <div class="ui stackable two column grid">
        <div class="four wide column">
            <div class="ui top attached segment">
                <h4 class="ui header">
                    <i class="headphones icon" aria-hidden="true"></i>
                    <div class="content">
                        <span class="ui blue text"></span>
                        <div class="ui scrolling dropdown">
                          <input type="hidden">
                          <div class="default text">{{ t._('module_monitorCalls_needSelectQueue') }}</div>
                          <i class="dropdown icon"></i>
                          <div class="menu">
                           <div class="item" v-for="(queueData, id) in queues" :key="id" :data-value="id"> <% queueData.name %> [<% queueData.number %>]</div>
                          </div>
                        </div>
                    </div>
                </h4>
            </div>
            <div class="ui bottom attached segment">
                <h4 class="ui dividing header"> {{ t._('module_monitorCalls_waitingClients') }} </h4>
                <div class="ui relaxed divided list">
                    <div v-for="call in calls" v-if="call.dst_chan==='' && minWaitVisible <= formatElapsedTime(call.queueData.EnterTime)" :key="call.linkedid" :data-linked-id="call.linkedid" class="item">
                        <i class="small teal phone volume icon" aria-hidden="true"></i>
                        <div class="content">
                            <div class="header">
                                <i v-if="hasClientByPhone(call.src_num)" class="address book outline icon" aria-hidden="true"></i>
                                <% getClientHeader(call.src_num) %>
                            </div>
                            <div class="description">{{ t._('module_monitorCalls_waitingTitleClient') }}: <% formatElapsedTime(call.queueData.EnterTime) %></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="twelve wide column">
            <div class="ui segment">
                <div class="ui cards agent-cards">
                    <div
                        v-for="agent in agentsList"
                        :key="agent.number"
                        class="ui card agent-card"
                        :class="{
                            'row-available': agent.state === 'Idle',
                            'row-in-call': (agent.state === 'Up'),
                            'row-dialing': (agent.state === 'Ringing' || agent.state === 'Ring' || agent.state === 'Busy'),
                            'row-offline': agent.state === 'Unavailable'
                        }"
                    >
                        <div class="content">
                            <div class="header agent-card-header">
                                <span
                                    class="ui mini basic label agent-num-label"
                                    :class="{
                                        'green': agent.state === 'Idle',
                                        'blue': (agent.state === 'Up'),
                                        'pink': (agent.state === 'Ringing' || agent.state === 'Ring' || agent.state === 'Busy'),
                                        'grey': agent.state === 'Unavailable'
                                    }"
                                >
                                    <% agent.number %>
                                </span>
                                <span class="agent-name"><% agent.name %></span>
                            </div>

                            <div class="meta agent-peer" v-if="hasPeerPhone(agent.number)">
                                <div class="peer-line">
                                    <i class="phone icon" aria-hidden="true"></i>
                                    <span class="agent-phone"><% getPeerPhoneLabel(agent.number) %></span>
                                </div>
                                <div class="peer-line peer-name">
                                    <i class="address book outline icon" aria-hidden="true"></i>
                                    <span><% getPeerNameLabel(agent.number) %></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="ui tiny labels">
                    <div class="ui green label"><i class="circle icon" aria-hidden="true"></i> {{ t._('module_monitorCalls_legendTitleIdle') }} </div>
                    <div class="ui blue label"><i class="phone volume icon" aria-hidden="true"></i>{{ t._('module_monitorCalls_legendTitleInCall') }}</div>
                    <div class="ui pink label"><i class="angle double right icon" aria-hidden="true"></i>{{ t._('module_monitorCalls_legendTitleCalling') }}</div>
                    <div class="ui red label"><i class="user secret icon" aria-hidden="true"></i>{{ t._('module_monitorCalls_legendTitleSpy') }}</div>
                    <div class="ui grey label"><i class="ban icon" aria-hidden="true"></i>{{ t._('module_monitorCalls_legendTitleDisable') }}</div>
                </div>
            </div>
        </div>
    </div>
</div>


<table id="calls" class="ui single line very compact table">
  <thead v-if="calls.length" >
    <tr>
        <th>{{ t._('module_monitorCalls_Start') }}</th>
        <th class='right aligned'>{{ t._('module_monitorCalls_Who') }}</th>
        <th>{{ t._('module_monitorCalls_Whom') }}</th>
        <th class='center aligned'>{{ t._('module_monitorCalls_columnTitleWaitTime') }}</th>
        <th class='center aligned'>{{ t._('module_monitorCalls_columnTitleTalkTime') }}</th>
        <th class='right aligned'>{{ t._('module_monitorCalls_columnTitleAction') }}</th>
    </tr>
  </thead>
  <tbody>
    <tr v-for="call in calls" v-if="callIsVisible(call)"
                        :key="call.linkedid" :data-linked-id="call.linkedid" :class="{
                                                                                    'row-in-spy': (call.spyer),
                                                                                    'row-in-call': (call.dst_num),
                                                                                    'row-pause': (call.dst_num === '' && call.bridgeChannels && call.bridgeChannels.length),
                                                                                    'row-dialing': (call.dst_num === '' && call.calledChannels && call.calledChannels.length),
                                                                                  }">
      <td class="collapsing">  <% formatTimestampToTime(call.start) %> </td>
      <td class='need-update right aligned' :data-phone="call.src_num" :data-chan="call.src_chan" ><% getClientHeader(call.src_num) %></td>

      <!--  Номер назначения начало -->
      <td v-if="call.dst_num" class="need-update" :data-phone="call.dst_num" :data-chan="call.dst_chan"><% getClientHeader(call.dst_num) %></td>
      <td v-else-if="call.bridgeChannels && call.bridgeChannels.length" class="" :data-phone="call.src_num" :data-chan="call.src_chan">
          <span v-for="bridge in call.bridgeChannels"  title="" class="ui mini basic label blue">
              <i aria-hidden="true" class="circle icon"></i> <span :data-phone="bridge.src_num" class="need-update"><% getClientHeader(bridge.src_num) %></span>
          </span>
          <span v-for="(bridge, index) in call.bridgeChannels" :key="'dst-' + index" title="" class="ui mini basic label blue">
              <i aria-hidden="true" class="circle icon"></i> <span :data-phone="bridge.dst_num" class="need-update"><% getClientHeader(bridge.dst_num) %></span>
          </span>
      </td>
      <td v-else-if="call.calledChannels && call.calledChannels.length" class="" :data-phone="call.src_num" :data-chan="call.src_chan">
          <span v-for="chanData in call.calledChannels"  title="" class="ui mini basic label pink">
              <i aria-hidden="true" class="circle icon"></i> <span :data-phone="chanData.channel" class="need-update"><% getClientHeader(chanData.number) %></span>
          </span>
      </td>
      <td v-else-if="call.spyer" class="" :data-phone="call.src_num" :data-chan="call.src_chan">
          <span title="" class="ui mini basic label red">
              <i aria-hidden="true" class="user secret icon"></i>
              <span :data-phone="call.src_num" :data-spyee-chan="call.spy_chan" class="need-update"><% call.spy_num %></span>
          </span>
      </td>
      <td v-else class="" :data-phone="call.src_num" :data-chan="call.src_chan"><% getClientHeader(call.exten) %></td>
      <!--  Номер назначения конец -->

      <td class='center aligned collapsing' >
          <% getWaitTime(call) %>
      </td>
      <td class='center aligned collapsing' >
          <% getCallTime(call) %>
      </td>

      <td class="collapsing right aligned">
        {% if userNumber !== "" %}
        <button v-on:click="joinAction"    :data-ch1="call.src_chan" :data-ch2="call.dst_chan" data-tooltip="{{ t._('module_monitorCalls_joinAction') }}" class="ui mini basic icon button"><i class="users icon"></i></button>
        <button v-if="call.typeCall !== 'inner'" v-on:click="whisperAction" :data-call-type="call.typeCall" :data-ch1="call.src_chan" :data-ch2="call.dst_chan" data-tooltip="{{ t._('module_monitorCalls_whisperAction') }}" class="ui mini icon  basic button"><i class="user secret icon"></i></button>
        <button v-on:click="listenAction"  :data-ch1="call.src_chan" :data-ch2="call.dst_chan" data-tooltip="{{ t._('module_monitorCalls_listenAction') }}" class="ui mini icon basic button"><i class="deaf icon"></i></button>
        {% endif %}
        <button v-show="fullAccess" v-on:click="hangupAction"  :data-ch1="call.src_chan" :data-ch2="call.dst_chan" data-tooltip="{{ t._('module_monitorCalls_hangupAction') }}" class="ui mini icon  basic button"><i class="delete icon"></i></button>
      </td>
    </tr>
  </tbody>
</table>