# datagen

가공의 회사와 3제표를 만든다. 산업 파라미터는 `distributions.py`, 주 프로파일은 `states.py`에 있고 전부 자리표시자다. EDGAR, Census, BLS, Damodaran에 적합하지 않았다.

```bash
node tools/build-geo.mjs
python3 tools/datagen/generate.py --check
```

주 경계(`public/geo/us-states.json`)가 먼저 있어야 한다. 회사의 좌표를 주 안에 놓고, 검증이 다시 확인한다.

기본 출력:

- `public/content/universe.json`. sim-core가 게임을 열 때 읽는 첫날의 장부와 파라미터. 분기 이력 없음
- `src/data/fixtures/sample-companies.json`. 앞 4개사의 전체 이력. 생성기 검사용이고 클라이언트가 import하지 않는다
- `tools/datagen/out/companies.json`, `content.sqlite`. 깃에 올리지 않는다

시드 2024, 미국 24개 주의 250개사, 6개 섹터, 2025Q1–2026Q4. 게임은 2027년 1월에 열린다. 단위는 천 달러 정수다. 주가 필드는 없고 모델 배수만 있다.

회사는 주 프로파일에서 나온다. 주의 가중치가 회사 수를, 섹터 구성이 섹터를, 규모 계수가 매출을, 임금 지수가 판관비와 인원을 정한다. 노조 강도는 회사에 실려 파업 확률이 된다.

검증이 실패하면 파일을 쓰기 전에 종료 코드 1로 빠진다. 대차 균형, 현금 롤포워드, 이익잉여금, 이름, 주 안의 좌표, 좌표 정밀도, 티커 부재를 본다.

의존성 없다. Python 3 표준 라이브러리만 쓴다.
