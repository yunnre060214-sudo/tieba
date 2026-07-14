import 'dotenv/config';
import { createProductionDependencies, runApp } from './app';

runApp(process.env, createProductionDependencies())
  .then(code => {
    process.exitCode = code;
  })
  .catch(() => {
    console.error('无法恢复的启动错误');
    process.exitCode = 1;
  });
