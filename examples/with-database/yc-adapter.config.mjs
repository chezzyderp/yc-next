import yandexCloudAdapter from "@yc-next/cli";

export default yandexCloudAdapter({
  functionName: "with-database-example",
  outputDir: ".next/yc",
  runtimeEnv: ["DATABASE_URL"],
});
