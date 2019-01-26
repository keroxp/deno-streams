(() => {
  const src = "012356789";
  const stream = new ReadableStream(
    {
      start(controller) {
        let i = 0;
        let id;
        id = setInterval(() => {
          if (i >= src.length) {
            controller.close();
            clearInterval(id);
            return;
          }
          const chunk = src[i++];
          // キューに追加する。
          controller.enqueue(chunk);
        }, 1000);
      }
    },
    {
      size(chunk) {
        console.log("size, ", chunk);
        return 1;
      }
    }
  );
  const rd = stream.getReader();
  let result = "";
  const readChunk = ({ value, done }: { value: string; done: boolean }) => {
    console.log(`value: ${value}, done: ${done}`);
    result += value;
    if (!done) rd.read().then(readChunk);
  };
  rd.read().then(readChunk);
})();
