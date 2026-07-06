const fs = require('fs');
const path = require('path');

const agents = ['editorial', 'research', 'script', 'critic'];

agents.forEach(agent => {
  const pkgJson = {
    name: `@cos/agent-${agent}`,
    version: "0.1.0",
    private: true,
    type: "module",
    main: "dist/index.js",
    scripts: {
      "build": "tsc",
      "dev": "tsx watch src/index.ts",
      "start": "node dist/index.js"
    },
    dependencies: {
      "@cos/events": "workspace:*",
      "@cos/types": "workspace:*",
      "@cos/llm": "workspace:*",
      "@cos/knowledge": "workspace:*",
      "bullmq": "^5.0.0",
      "dotenv": "^16.0.0"
    },
    devDependencies: {
      "tsx": "^4.0.0",
      "typescript": "*"
    }
  };

  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      outDir: "./dist",
      rootDir: "./src"
    },
    include: ["src/**/*"]
  };

  const agentDir = path.join(__dirname, 'apps', 'agents', agent);
  fs.writeFileSync(path.join(agentDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
  fs.writeFileSync(path.join(agentDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
});
console.log('Scaffold complete');
