<?php
/**
 * Copyright © MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Alexey Portnov, 12 2019
 */


namespace Modules\ModuleMonitorActiveCalls\Lib;

use MikoPBX\Core\System\SystemMessages;
use MikoPBX\Core\System\Util;
use MikoPBX\Core\Workers\Cron\WorkerSafeScriptsCore;
use MikoPBX\Modules\Config\ConfigClass;
use MikoPBX\PBXCoreREST\Lib\PBXApiResult;
use Modules\ModuleMonitorActiveCalls\bin\ActiveCallsFromCdr;
use Modules\ModuleMonitorActiveCalls\bin\WorkerActiveCalls;
use Modules\ModuleMonitorActiveCalls\bin\WorkerAmiActions;

class MonitorActiveCallsConf extends ConfigClass
{

    /**
     * Receive information about mikopbx main database changes
     *
     * @param $data
     */
    public function modelsEventChangeData($data): void
    {
    }

    /**
     * Returns module workers to start it at WorkerSafeScriptCore
     *
     * @return array
     */
    public function getModuleWorkers(): array
    {
        return [
            /*
            [
                'type'   => WorkerSafeScriptsCore::CHECK_BY_PID_NOT_ALERT,
                'worker' => ActiveCallsFromCdr::class,
            ],
            //*/
            [
                'type'   => WorkerSafeScriptsCore::CHECK_BY_BEANSTALK,
                'worker' => WorkerAmiActions::class,
            ],
            [
                'type'   => WorkerSafeScriptsCore::CHECK_BY_AMI,
                'worker' => WorkerActiveCalls::class,
            ],
        ];
    }

    /**
     * @param array $tasks
     */
    public function createCronTasks(array &$tasks): void
    {
        $busyboxPath= Util::which('busybox');
        $tasks[]    = "*/1 * * * * $busyboxPath find /storage/usbdisk*/mikopbx/tmp/SelectCdrService/ -mmin +1 -type f -delete> /dev/null 2>&1".PHP_EOL;
        $tasks[]    = "*/1 * * * * $busyboxPath find /storage/usbdisk*/mikopbx/tmp/WorkerAmiActions/ -mmin +1 -type f -delete> /dev/null 2>&1".PHP_EOL;

        $phpPath   = Util::which('php');
        $tasks[]    = "*/1 * * * * $phpPath -f $this->moduleDir/bin/safe.php > /dev/null 2>&1".PHP_EOL;
    }
}