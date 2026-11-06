// 모의 저장소 초기화: 다음 요청 시 seed 데이터로 다시 만들어진다.
import fs from "node:fs";
import path from "node:path";
const file = process.env.MOCK_DB_PATH ?? path.join(process.cwd(), ".data", "mock-db.json");
fs.rmSync(file, { force: true });
console.log(`모의 데이터 초기화: ${file}`);
