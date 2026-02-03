<?php
/*
 * MikoPBX - free phone system for small business
 * Copyright © 2017-2025 Alexey Portnov and Nikolay Beketov
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

use MikoPBX\Core\System\Util;
use MikoPBX\Core\System\Processes;
use MikoPBX\Core\System\SystemMessages;
use MikoPBX\Modules\PbxExtensionUtils;
use Modules\ModuleMonitorActiveCalls\bin\WorkerActiveCalls;
use Modules\ModuleMonitorActiveCalls\Lib\MonitorActiveCallsConf;
require_once 'Globals.php';

$moduleEnable = PbxExtensionUtils::isEnabled('ModuleMonitorActiveCalls');
if(!$moduleEnable){
    exit(1);
}

// Максимальное время на инициализацию (status=starting)
$maxStartingAge = 120;
// Максимальное время без обновления state-файла (status=running)
$maxRunningAge = 90;

$conf = new MonitorActiveCallsConf();
$workers = $conf->getModuleWorkers();
foreach ($workers as $workerData) {
    $workerClass = $workerData['worker'];
    $WorkerPID = Processes::getPidOfProcess($workerClass);

    // Проверка дубликатов процесса
    if (!empty($WorkerPID)) {
        $allButLast = array_slice(explode(' ', $WorkerPID), 0, -1);
        if (!empty($allButLast)) {
            $bbPath = Util::which('busybox');
            shell_exec("$bbPath kill -SIGUSR2 " . implode(" ", $allButLast));
        }
    }

    // Для WorkerActiveCalls — проверяем state-файл
    if ($workerClass === WorkerActiveCalls::class) {
        $needRestart = false;
        $reason = '';

        if (empty($WorkerPID)) {
            $needRestart = true;
            $reason = 'no PID found';
        } else {
            $stateFile = WorkerActiveCalls::STATE_FILE;
            if (!file_exists($stateFile)) {
                $needRestart = true;
                $reason = 'state file missing';
            } else {
                $stateRaw = file_get_contents($stateFile);
                $state = json_decode($stateRaw, true);
                if (!is_array($state) || empty($state['ts']) || empty($state['status'])) {
                    $needRestart = true;
                    $reason = 'state file corrupted';
                } else {
                    $age = time() - $state['ts'];
                    $status = $state['status'];
                    $statePid = $state['pid'] ?? 0;

                    // PID в state-файле не совпадает с реальным процессом
                    $pidParts = explode(' ', $WorkerPID);
                    $lastPid = (int)trim(end($pidParts));
                    if ($statePid > 0 && $statePid !== $lastPid) {
                        $needRestart = true;
                        $reason = "state PID ($statePid) != process PID ($lastPid)";
                    } elseif ($status === 'starting' && $age > $maxStartingAge) {
                        $needRestart = true;
                        $reason = "stuck in starting for {$age}s (max {$maxStartingAge}s)";
                    } elseif ($status === 'running' && $age > $maxRunningAge) {
                        $needRestart = true;
                        $reason = "state file stale for {$age}s (max {$maxRunningAge}s)";
                    }
                }
            }
        }

        if ($needRestart) {
            // Убиваем старый процесс если есть
            if (!empty($WorkerPID)) {
                $bbPath = Util::which('busybox');
                shell_exec("$bbPath kill -9 " . str_replace(' ', ' -9 ', $WorkerPID));
                usleep(500000);
            }
            // Удаляем старый state-файл
            if (file_exists(WorkerActiveCalls::STATE_FILE)) {
                unlink(WorkerActiveCalls::STATE_FILE);
            }
            Processes::processPHPWorker($workerClass);
            SystemMessages::sysLogMsg(
                'MonitorActiveCalls_SAFE',
                "WorkerActiveCalls restarted: $reason",
                LOG_NOTICE
            );
        }
        continue;
    }

    // Для остальных воркеров — стандартная проверка по PID
    if (empty($WorkerPID)) {
        Processes::processPHPWorker($workerClass);
        SystemMessages::sysLogMsg('MonitorActiveCalls_SAFE', "Service $workerClass started.", LOG_NOTICE);
    }
}
