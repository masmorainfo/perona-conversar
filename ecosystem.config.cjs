module.exports = {
  apps: [
    {
      name: 'cos-supervisor',
      script: 'apps/supervisor/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-registry',
      script: 'apps/registry/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-script',
      script: 'apps/agents/script/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-media',
      script: 'apps/agents/media/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-render',
      script: 'apps/agents/render/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-publisher',
      script: 'apps/agents/publisher/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-quality',
      script: 'apps/agents/quality/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-critic',
      script: 'apps/agents/critic/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-cinematic-review',
      script: 'apps/agents/cinematic-review/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-editorial',
      script: 'apps/agents/editorial/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-research',
      script: 'apps/agents/research/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-analytics',
      script: 'apps/agents/analytics/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-learning',
      script: 'apps/agents/learning/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-world-observer',
      script: 'apps/agents/world-observer/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-signal-normalizer',
      script: 'apps/agents/signal-normalizer/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-scheduler',
      script: 'apps/agents/scheduler/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-observer',
      script: 'apps/agents/observer/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-agent-cycle-clock',
      script: 'apps/agents/cycle-clock/dist/index.js',
      cwd: '.',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cos-mission-control',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p ' + (process.env.PORT || '3000'),
      cwd: 'apps/mission-control',
      env: { NODE_ENV: 'production' }
    }
  ]
};
