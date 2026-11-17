# datagen

가공의 회사와 분기 3제표를 만든다. 산업 파라미터는 `distributions.py`에 있고, 전부 자리표시자다. KOSIS, DART, EDGAR, Damodaran에 적합하지 않았다.

```bash
python3 tools/datagen/generate.py --check
```

기본 출력:

- `tools/datagen/out/companies.json` (깃에 올리지 않음)
- `tools/datagen/out/content.sqlite` (깃에 올리지 않음)
- `src/data/fixtures/sample-companies.json` (헬로 월드가 읽는 샘플)

시드 2024, 회사 4곳, 2024Q1–2025Q4. 단위는 백만 원 정수다. 주가 필드는 없고, 모델 배수만 있다.

검증이 실패하면 파일을 쓰기 전에 종료 코드 1로 빠진다. 대차 균형, 현금 롤포워드, 이익잉여금, 이름, 좌표, 티커 부재를 본다.

의존성 없다. Python 3 표준 라이브러리만 쓴다.
