# 재무 계산

LBO와 워터폴은 게임 규칙으로 직접 짠다. 기성 라이브러리가 우리 3제표와 코버넌트를 대신하지 않는다. 아래는 검산과 학습용이다. 스펙은 [재무 모델](../finance/model-spec.md)이다.

## numpy-financial

- 문서: <https://numpy.org/numpy-financial/>
- 저장소: <https://github.com/numpy/numpy-financial>
- 라이선스: BSD. 저작권 고지와 조건 유지.
- 이유: IRR, NPV의 검산. 생성기 적합 스크립트에서만 쓰고, 게임 런타임은 Rust로 같은 정의를 구현한다.

## QuantLib

- 주소: <https://www.quantlib.org/>
- 이유: 금리 곡선과 일정. 우리 v1의 이자는 `기초 잔액 × 연율 / 4`면 충분하다. 변동 스프레드와 이자 일정을 정교하게 만들 때 정의를 대조한다.
- 라이선스: 프로젝트는 BSD로 배포된다고 널리 알려져 있다. 이 점검에서 LICENSE 파일 본문은 열지 않았다.

## Formula.js

- 저장소: <https://github.com/formulajs/formulajs>
- 라이선스: MIT.
- 이유: 엑셀의 XIRR, PMT와 같은 정의를 JS에서 대조할 때. 런타임 전부는 가져오지 않고, 필요한 함수의 정의만 테스트로 맞춘다.

## pandas, SciPy

- <https://pandas.pydata.org/>
- <https://scipy.org/>
- 라이선스: 둘 다 BSD 계열로 배포된다. 이 점검에서 각 LICENSE 본문은 열지 않았다.
- 이유: 공시에서 분포를 적합하는 오프라인 스크립트. 게임 패키지에 넣지 않는다. 생성기의 첫 버전은 일부러 의존성이 없다.

## LBO를 읽는 무료 자료

라이브러리가 아니라 모델의 체크리스트다.

- Macabacus 장·단기 LBO 템플릿 안내: <https://macabacus.com/lbo-model/templates> 템플릿 자체의 재배포 권리는 그 페이지의 다운로드 조건을 따른다. 우리 코드로 베끼지 않는다.
- Wall Street Prep 단기 LBO 해설: <https://www.wallstreetprep.com/knowledge/lbo-model/> 조달과 사용, 부채 스케줄, IRR, MOIC.
- ILPA 용어집의 LBO 항목: <https://ilpa.org/resources-tools/private-equity-101/private-equity-glossary/> 단순 클라이언트는 403이었고, 브라우저형 조회에서 본문을 확인했다.

## 워터폴

회수 순위를 구현한 오픈 소스 표준 라이브러리는 이 목록에 넣지 않았다. 확인할 수 있는 구현이 우리 규칙과 같아서가 아니다. 순위는 스펙의 게임 규칙으로 두고, 도산법 조문을 코드에 베끼지 않는다.
