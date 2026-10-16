import { spawn } from 'child_process';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runCommandWithSpinner(fullCommand, options, spinnerText) {
  return new Promise((resolve, reject) => {
    const spinner = ora(spinnerText).start();

    // Pass the command as a single string — avoids [DEP0190]
    const child = spawn(fullCommand, {
      ...options,
      shell: true,
    });

    // Handle any startup/spawn error gracefully
    child.on('error', (err) => {
      spinner.fail(`${spinnerText} failed!`);
      reject(err);
    });

    // Whenever a new log line arrives, update spinner.text
    child.stdout?.on('data', (data) => {
      const line = data.toString().trim().split('\n').pop();
      if (line) spinner.text = `${spinnerText} -> ${line.slice(0, 50)}...`;
    });

    child.on('close', (code) => {
      if (code === 0) {
        spinner.succeed(`${spinnerText} done!`);
        resolve();
      } else {
        spinner.fail(`${spinnerText} failed!`);
        reject(new Error(`Exited with code ${code}`));
      }
    });
  });
}

async function main() {
  try {
    // Step 1: Build Setup UI (single command string)
    await runCommandWithSpinner(
      'npm run build:app',
      { stdio: 'pipe' },
      'Building Setup UI'
    );

    // Step 2: Build Companion EXE (single command string)
    await runCommandWithSpinner(
      'powershell -ExecutionPolicy Bypass -File ./build-script.ps1',
      { stdio: 'pipe', cwd: '..' },
      'Building Nexus EXE'
    );

    // Step 3: Copy nexus.exe from companion/dist to Local-BE-v2 root
    const distExe = path.resolve(__dirname, '../companion/dist/nexus.exe');
    const productionFolder = path.resolve(__dirname, '../production');
    if (!fs.existsSync(productionFolder)) {
      fs.mkdirSync(productionFolder);
    }
    if (fs.existsSync(productionFolder + "/nexus.exe")) {
      console.log("Deleting the old exe file...");
      fs.unlinkSync(productionFolder + "/nexus.exe");
    }
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await sleep(1000);
    if (fs.existsSync(distExe)) {
      console.log("Copying the new exe file...")
      fs.copyFileSync(distExe, productionFolder + "/nexus.exe");
      console.log('✔ Copied nexus.exe to Local-BE-v2/production');
    }


    console.log('Build finished successfully!');
  } catch (error) {
    console.error('Build process failed:', error.message);
    process.exit(1);
  }
}

main();
