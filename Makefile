format:
	deno --allow-run https://deno.land/x/std/prettier/main.ts --write *.ts
.PHONY: test
test:
	deno readable_stream_test.ts
	deno writable_stream_test.ts