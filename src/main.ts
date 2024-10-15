import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as readline from 'readline';

// Ścieżka do pliku wentylatora (dostosuj do swojego systemu)
const FAN_PATH = '/sys/class/hwmon/hwmon12/fan1_input'; // Zmień na odpowiednią ścieżkę

// Maksymalna prędkość wentylatora
const MAX_RPM = 7561;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function readFanSpeed(): number | null {
  try {
    const rpm = fs.readFileSync(FAN_PATH, 'utf-8').trim();
    return parseInt(rpm, 10);
  } catch (error) {
    console.error(`Błąd odczytu prędkości wentylatora: ${error.message}`);
    return null;
  }
}

function calculateFanUsage(currentRpm: number): number {
  currentRpm = Math.max(0, Math.min(currentRpm, MAX_RPM)); // Ograniczenie do zakresu
  return (currentRpm / MAX_RPM) * 100;
}

function setFanAuto(): void {
  try {
    child_process.execSync('sudo ectool autofanctrl', {stdio: 'inherit'});
    console.log('Wentylator ustawiony w trybie automatycznym.');
  } catch (error) {
    console.error(`Błąd podczas ustawiania wentylatora w trybie automatycznym: ${error.message}`);
  }
}

function setFanDuty(duty: number): void {
  if (duty >= 0 && duty <= 100) {
    try {
      child_process.execSync(`sudo ectool fanduty ${duty}`, {stdio: 'inherit'});
      console.log(`Wentylator ustawiony na ${duty}%`);
    } catch (error) {
      console.error(`Błąd podczas ustawiania wentylatora na ${duty} %: ${error.message}`);
    }
  } else {
    console.error('Wartość musi być w zakresie 0-100.');
  }
}

function main(): void {
  rl.on('line', (input) => {
    switch (input.trim()) {
      case '1':
        const currentRpm = readFanSpeed();
        if (currentRpm !== null) {
          const fanUsagePercent = calculateFanUsage(currentRpm);
          console.log(
            `Użycie wentylatora: ${fanUsagePercent.toFixed(2)}% (Bieżące RPM: ${currentRpm})`
          );
        }
        break;
      case '2':
        setFanAuto();
        break;
      case '3':
        rl.question('Podaj wartość wentylatora (0-100): ', (dutyInput) => {
          const duty = parseInt(dutyInput, 10);
          if (!isNaN(duty)) {
            setFanDuty(duty);
          } else {
            console.error('Proszę podać poprawną liczbę całkowitą.');
          }
        });
        break;
      case '4':
        console.log('Program zakończony.');
        rl.close();
        break;
      default:
        console.log('Niepoprawny wybór, spróbuj ponownie.');
        break;
    }
  });

  console.log('\n1. Wyświetl użycie wentylatora');
  console.log('2. Ustaw wentylator w trybie automatycznym');
  console.log('3. Ustaw wartość wentylatora (0-100)');
  console.log('4. Zakończ');
}

main();
