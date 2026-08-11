import { CollectTool } from '../../domain/entities/tool.js';
import { safeIdentifier } from './parsers/sql-helpers.js';

const EXCLUDED_WAIT_TYPES = [
  'SLEEP_TASK',
  'BROKER_TASK_STOP',
  'SLEEP_SYSTEMTASK',
  'SQLTRACE_WAIT_ENTRIES',
  'SLEEP_BPOOL',
  'XE_TIMER_EVENT',
  'SLEEP_DBSTARTUP',
  'REQUEST_FOR_DEADLOCK_SEARCH',
  'BROKER_TO_FLUSH',
  'XE_DISPATCHER_JOIN',
  'BROKER_RECEIVE_WAITFOR',
  'BROKER_EVENTHANDLER',
  'CHECKPOINT_QUEUE',
  'LAZYWRITER_SLEEP',
  'DIRTY_PAGE_POLL',
  'PREEMPTIVE_OS_LIBRARYOPS',
  'CLR_AUTO_EVENT',
  'CLR_MANUAL_EVENT',
  'BROKER_TRANSMITTER',
  'LOGMGR_QUEUE',
  'DBMIRROR_EVENTS_QUEUE',
  'TRACEWRITE',
  'BROKER_DISPATCHER',
  'HADR_FILESTREAM_IOMGR_IOCOMPLETION',
  'SQLTRACE_INCREMENTAL_FLUSH_SLEEP',
  'SQLTRACE_BUFFER_FLUSH',
  'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP',
];

export function createGetWaitStatsTool() {
  return new CollectTool({
    name: 'get_wait_stats',
    description:
      'Gera um script T-SQL que consulta sys.dm_os_wait_stats para identificar os tipos de espera (waits) mais relevantes do servidor.',
    parameters: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Nome do banco de dados de destino (opcional).' },
        topN: { type: 'integer', description: 'Quantidade de waits a retornar (padrão 20).' },
      },
    },
    buildScript({ database, topN }) {
      const db = database ? safeIdentifier(database, 'SeuBanco') : null;
      const limit = Number(topN) > 0 ? Number(topN) : 20;
      const excluded = EXCLUDED_WAIT_TYPES.map((type) => `'${type}'`).join(', ');
      const script = [
        'SELECT',
        '  TOP',
        '  wait_type AS tipo_espera,',
        '  waiting_tasks_count AS tarefas_aguardando,',
        '  wait_time_ms AS tempo_espera_ms,',
        '  signal_wait_time_ms AS tempo_sinal_ms,',
        '  wait_time_ms - signal_wait_time_ms AS tempo_recurso_ms',
        'FROM sys.dm_os_wait_stats',
        `WHERE wait_type NOT IN (${excluded})`,
        'ORDER BY wait_time_ms DESC;',
        'GO',
      ].join('\n');
      const header = db ? [`USE [${db}];`, 'GO'].join('\n') : '';
      return [header, script].filter(Boolean).join('\n');
    },
  });
}
