const { FuseBox } = require("fuse-box");

const fuse = FuseBox.init({
  homeDir: ".",
  output: "dist/$name.js"
});

fuse.bundle("app").instructions(`> index.ts`);

fuse.run();
