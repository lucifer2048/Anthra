const major = Number(process.versions.node.split(".")[0]);

if (major < 20 || major >= 23) {
  console.error(
    `Anthra requires Node 20.x (package.json engines, .nvmrc). Current: ${process.version}`
  );
  console.error("Switch Node, then retry. Example: nvm use");
  process.exit(1);
}
