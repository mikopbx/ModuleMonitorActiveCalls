<?php
/**
 * Copyright © MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Alexey Portnov, 11 2018
 */
namespace Modules\ModuleMonitorActiveCalls\App\Controllers;
use MikoPBX\AdminCabinet\Controllers\BaseController;
use MikoPBX\AdminCabinet\Controllers\SessionController;
use MikoPBX\Common\Models\Extensions;
use MikoPBX\Common\Models\PbxExtensionModules;
use MikoPBX\Common\Providers\PBXConfModulesProvider;
use MikoPBX\Common\Providers\SessionProvider;
use MikoPBX\Modules\Config\CDRConfigInterface;
use MikoPBX\Modules\PbxExtensionUtils;
use Modules\ModuleMonitorActiveCalls\App\Forms\ModuleMonitorActiveCallsForm;
use Modules\ModuleMonitorActiveCalls\bin\WorkerAmiActions;
use Modules\ModuleMonitorActiveCalls\Lib\CacheManager;
use Modules\ModuleMonitorActiveCalls\Models\ModuleMonitorActiveCalls;
use Modules\ModuleMonitorActiveCalls\Models\UsersSettings;
use Modules\ModuleUsersUI\Lib\Constants;
use Modules\ModuleUsersUI\Models\AccessGroups;
use Modules\ModuleUsersUI\Models\UsersCredentials;
use Modules\ModuleSoftphoneBackend\Lib\RestAPI\Controllers\ApiController as ModuleSoftphoneBackendApi;

class ModuleMonitorActiveCallsController extends BaseController
{
    private string $moduleUniqueID = 'ModuleMonitorActiveCalls';
    private string $moduleDir = '';

    /**
     * Basic initial class
     */
    public function initialize(): void
    {
        $this->moduleDir = PbxExtensionUtils::getModuleDir($this->moduleUniqueID);
        $this->view->logoImagePath = "{$this->url->get()}assets/img/cache/$this->moduleUniqueID/logo.svg";
        $this->view->submitMode = null;
        parent::initialize();
    }

    /**
     * Index page controller
     */
    public function indexAction(): void
    {
        $footerCollection = $this->assets->collection('footerJS');
        $footerCollection->addJs('js/pbx/main/form.js', true);
        $footerCollection->addJs('js/vendor/datatable/dataTables.semanticui.js', true);
        $footerCollection->addJs("js/cache/$this->moduleUniqueID/module-monitor-active-calls-index.js", true);
        $footerCollection->addJs('js/vendor/jquery.tablednd.min.js', true);
        $footerCollection->addJs('js/vendor/vue.js', true);

        $headerCollectionCSS = $this->assets->collection('headerCSS');
        $headerCollectionCSS->addCss("css/cache/$this->moduleUniqueID/module-monitor-active-calls.css", true);
        $headerCollectionCSS->addCss('css/vendor/datatable/dataTables.semanticui.min.css', true);
        $headerCollectionCSS->addCss('css/vendor/semantic/comment.css', true);
        $headerCollectionCSS->addCss('css/vendor/semantic/card.css', true);
        $headerCollectionCSS->addCss('css/vendor/semantic/list.css', true);

        $this->view->form = new ModuleMonitorActiveCallsForm();
        $this->view->pick("$this->moduleDir/App/Views/index");

        [$userRestrictions, $userNumber, $userId, $cid] = $this->getUserData();

        $filterExten = [
            'type=:type:',
            'bind' => [
                'type'   => Extensions::TYPE_SIP,
            ]
        ];
        $users = Extensions::find($filterExten)->toArray();
        foreach ($users as &$user) {
            $user['id'] = $user['userid'];
            $user['active'] = $user['userid'] === $userId;
            $user['username'] = "$user[callerid] <$user[number]>";
        }
        $this->view->usersArray = $users;

        $this->view->userRestrictions = implode(',', $userRestrictions);

        $this->view->userId = $userId;
        $this->view->userNumber = $userNumber;
        $this->view->cid = $cid;
        $this->view->queueId = '';

        $settings = UsersSettings::find([
            'userId=:userId:',
            'bind' => [
                'userId' => $userId,
            ]
        ]);
        $minWaitVisible = 0;
        foreach ($settings as $setting){
            if('queueId' === $setting->key ){
                $this->view->queueId  = $setting->value;
            }elseif ('minWaitVisible' === $setting->key ){
                $minWaitVisible = intval($setting->value);
            }
        }
        $minWaitVisibleVariants = [];
        foreach ([0,10,20,30,40,50,60] as $value){
            $minWaitVisibleVariants[] = ['id' => $value, 'active' => $minWaitVisible === $value, 'name' => $value];
        }
        $this->view->minWaitVisible = $minWaitVisibleVariants;
        $this->view->minWaitVisibleValue  = $minWaitVisible;
    }

    /**
     * @return void
     */
    public function getActiveChannelsAction(): void
    {
        [$calls] = CacheManager::getCacheData('getActiveChannelsAction');
        if(is_array($calls)){
            $this->view->isCacheData = true;
            $this->view->lines = $calls;
            return ;
        }
        $this->view->lines = [];
    }

    /**
     * @return void
     */
    public function getActiveChannelsV2Action(): void
    {
        [$data] = CacheManager::getCacheData('getActiveChannelsV2Action');
        if(is_array($data)){
            $this->view->isCacheData = true;
            $this->view->calls  = $data['calls'];
            $this->view->queues = $data['queues'];
            return;
        }
        $this->view->queues = [];
    }

    /**
     * Save settings AJAX action
     */
    public function saveAction() :void
    {
        $data       = $this->request->getPost();
        $this->flash->success($this->translation->_('ms_SuccessfulSaved'));
        $this->view->success = true;
        $this->view->data = $data;
    }

    public function backandEnableAction() :void
    {
        $result = PbxExtensionModules::findFirstByUniqid("ModuleSoftphoneBackend");
        if ($result !== null && intval($result->disabled ) === 0) {
            // Модуль включен.
            $api = new ModuleSoftphoneBackendApi();
            $api->initialize();
            $this->view->data = $api->createLoginResponse('1', 'admin');
            $this->view->success = true;
        }else{
            $this->view->success = false;
            $this->view->data = [];
        }
    }

    public function saveUserAction():void
    {
        $data       = $this->request->getPost();
        $this->flash->success($this->translation->_('ms_SuccessfulSaved'));
        if(isset($data['adminUserId'])){
            $settings = ModuleMonitorActiveCalls::findFirst();
            if(!$settings){
                $settings = new ModuleMonitorActiveCalls();
            }
            $settings->adminUserId = $data['adminUserId']??'';
            $this->view->success = $settings->save();
        }elseif (isset($data['minWaitVisible']) ){
            [,,$userId,] = $this->getUserData();
            $key = 'minWaitVisible';
            $settings = UsersSettings::findFirst([
                 'userId=:userId: AND key=:key:',
                 'bind' => [
                     'userId' => $userId,
                     'key' => $key
                 ]
            ]);
            if(!$settings){
                $settings = new UsersSettings();
                $settings->userId = $userId;
                $settings->key = $key;
            }
            $settings->value = $data['minWaitVisible']??'';
            $this->view->success = $settings->save();
        }elseif (isset($data['queueId']) ){
            [,,$userId,] = $this->getUserData();
            $key = 'queueId';
            $settings = UsersSettings::findFirst([
                'userId=:userId: AND key=:key:',
                'bind' => [
                    'userId' => $userId,
                    'key' => $key
                ]
            ]);
            if(!$settings){
                $settings = new UsersSettings();
                $settings->userId = $userId;
                $settings->key = $key;
            }
            $settings->value = $data['queueId']??'';
            $this->view->success = $settings->save();
        }
        $this->view->data = $data;
    }

    /**
     * Performing an action on a call
     * @return void
     */
    public function executeCallAction():void
    {
        $data = $this->request->getPost();
        $_REQUEST['ip_srv'] = $_SERVER['SERVER_ADDR'];
        $dataForSend = [
            'data'           => $_REQUEST,
            'action'         => $data['action']
        ];
        $this->view->result = WorkerAmiActions::invokeApi('restAPICallback', [$dataForSend]) ;
    }

    private function getUserData():array
    {
        $userId     = '1';
        $userNumber = '';
        $cid = '';

        if(PbxExtensionUtils::isEnabled('ModuleUsersUI')){
            $session = $this->getDI()->get(SessionProvider::SERVICE_NAME)->get(SessionController::SESSION_ID);
            $roleId = str_replace(Constants::MODULE_ROLE_PREFIX,'', $session[SessionController::ROLE]??'');

            $roleData = AccessGroups::findFirst(['id=:id:', 'bind' => ['id' => $roleId]]);
            if($roleData){
                $this->view->roleName   = $roleData->name;
                $this->view->fullAccess = $roleData->fullAccess;
            }
            $this->view->username = $session[SessionController::USER_NAME]??'';
            $this->view->session  = json_encode($session);

            $filterCred = [
                'user_login=:user_login:',
                'bind' => [
                    'user_login' => $session[SessionController::USER_NAME]??""
                ]
            ];
            $credUI = UsersCredentials::findFirst($filterCred);
            if($credUI){
                $userId = $credUI->user_id;
                $filterExten = [
                    'type=:type: AND userid=:userid:',
                    'bind' => [
                        'type'   => Extensions::TYPE_SIP,
                        'userid' => $userId,
                    ]
                ];
                $ext = Extensions::findFirst($filterExten);
                if($ext){
                    $userNumber = $ext->number;
                    $cid = $ext->callerid;
                }
            }
        }
        $parameters = [];
        PBXConfModulesProvider::hookModulesMethod(CDRConfigInterface::APPLY_ACL_FILTERS_TO_CDR_QUERY, [&$parameters]);
        $userRestrictions = [];
        if(!$this->view->fullAccess){
            foreach ($parameters['bind']['filteredExtensions']??[] as $number){
                $userRestrictions[] = preg_replace('/[\D]+/', '', $number);
            }
            $userRestrictions[] = $userNumber;
        }

        if($userId === '1'){
            $settings = ModuleMonitorActiveCalls::findFirst();
            if($settings){
                $userId  = $settings->adminUserId;
                $filterExten = [
                    'type=:type: AND userid=:userid:',
                    'bind' => [
                        'type'   => Extensions::TYPE_SIP,
                        'userid' => $userId,
                    ]
                ];
                $ext = Extensions::findFirst($filterExten);
                if($ext){
                    $userNumber = $ext->number;
                    $cid        = $ext->callerid;

                    $this->view->roleName   = 'admin';
                    $this->view->fullAccess = true;
                }
            }
            $this->view->isRootUser = true;
        }

        return [$userRestrictions, $userNumber, $userId, $cid];
    }

}