const { exec } = require('child_process');

async function run(job) {
  const { target, scanId } = job;

  if (!target) {
    throw new Error('Target is required for Nikto scan');
  }

  const host = new URL(target).host;
  const niktoCommand = `perl /app/nikto/nikto.pl -h ${host} -Format json`;

  console.log(`Executing command: ${niktoCommand}`);

  return new Promise((resolve, reject) => {
    exec(niktoCommand, { timeout: 500 * 1000 }, (error, stdout, stderr) => {
      console.log(`Command execution finished for scan ${scanId}.`);
      if (stderr) {
        console.log(`stderr:`, stderr);
      }
      if (error) {
        console.error(`Error executing Nikto for scan ${scanId}:`, error);
        reject(error);
        return;
      }

      const results = JSON.parse(stdout);
      
      const runnerResult = {
        status: 'completed',
        scanId,
        userId: job.userId,
        resultsSummary: {
          totalHosts: 1,
          hostsUp: 1,
          totalPorts: results.banners ? results.banners.length : 0,
          openPorts: results.banners ? results.banners.length : 0,
          vulnerabilities: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          },
          summaryText: `Nikto scan found ${results.vulnerabilities.length} vulnerabilities.`,
          findings: results.vulnerabilities.map(v => ({
            title: v.description,
            description: v.uri,
            severity: 'info', // Nikto doesn't provide severity
          })),
        },
        rawOutput: results,
        billingUnits: 1,
        scannerType: 'nikto',
      };
      
      resolve(runnerResult);
    });
  });
}

module.exports = {
  run,
};
