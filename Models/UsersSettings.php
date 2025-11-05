<?php
/**
 * Copyright © MIKO LLC - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Alexey Portnov, 2 2019
 */

/*
 * https://docs.phalcon.io/4.0/en/db-models
 *
 */

namespace Modules\ModuleMonitorActiveCalls\Models;

use MikoPBX\Modules\Models\ModulesModelsBase;

class UsersSettings extends ModulesModelsBase
{

    /**
     * @Primary
     * @Identity
     * @Column(type="integer", nullable=false)
     */
    public $id;

    /**
     *
     * @Column(type="string", nullable=true, default="")
     */
    public $userId = '';

    /**
     *
     * @Column(type="string", nullable=true)
     */
    public $key;

    /**
     *
     * @Column(type="string", nullable=true)
     */
    public $value = '';

    public static function getDynamicRelations(&$calledModelObject): void
    {
    }

    public function initialize(): void
    {
        $this->setSource('m_UsersSettings');
        parent::initialize();
    }


}