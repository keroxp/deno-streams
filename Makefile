.PHONY: test
test:
	deno readable_stream_test.ts
	deno writable_stream_test.ts