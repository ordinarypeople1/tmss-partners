# datagen

가공의 회사와 분기 3제표를 만든다. 산업 파라미터는 `distributions.py`에 있고, 전부 자리표시자다. KOSIS, DART, EDGAR, Damodaran에 적합하지 않았다.

```bash
python3 tools/datagen/generate.py --check
```

기본 출력:

- `tools/datagen/out/companies.json` (깃에 올리지 않음)
- `tools/datagen/out/content.sqlite` (깃에 올리지 않음)
- `src/data/fixtures/sample-companies.json` (생성기 검사용 전체 이력. 클라이언트가 import하지 않음)
- `public/sample-page.json` (웹 클라이언트가 가져가는 카드 한 페이지. 분기 이력 없음)

시드 2024, 회사 4곳, 2024Q1–2025Q4. 단위는 백만 원 정수다. 주가 필드는 없고, 모델 배수만 있다.

검증이 실패하면 파일을 쓰기 전에 종료 코드 1로 빠진다. 대차 균형, 현금 롤포워드, 이익잉여금, 이름, 좌표, 티커 부재를 본다.

플레이 북은 샘플 픽스처를 바꾸지 않는다.

```bash
python3 tools/datagen/generate.py --atlas
```

시드 20241117, 회사 40곳, 2024Q1–2025Q4. 출력은 `public/atlas/boot.json`, `public/atlas/pages/cards-0.json`, `cards-1.json`, `public/atlas/companies/co-001.json`부터다. 부팅 파일의 회사에는 최신 장부만 있고 분기 배열은 없다. 카드 페이지는 20개다. 시계는 2026년 1분기 0주다. SQLite는 `tools/datagen/out/content.sqlite`에만 쓰고 깃에 올리지 않는다. 웹은 그 파일을 열지 않는다.

의존성 없다. Python 3 표준 라이브러리만 쓴다.
