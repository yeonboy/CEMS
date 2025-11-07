import { spawn } from 'child_process';

console.log('🚀 서버 시작 중...');

const server = spawn('node', ['scripts/backend_server.mjs'], {
  stdio: 'inherit',
  shell: true
});

server.on('error', (error) => {
  console.error('서버 시작 실패:', error);
});

server.on('exit', (code) => {
  console.log(`서버 종료됨 (코드: ${code})`);
});

console.log('✅ 서버 프로세스 시작됨 (PID:', server.pid, ')');
console.log('📍 http://localhost:3333 또는 http://localhost:8080');


