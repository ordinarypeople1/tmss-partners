# 합성 데이터와 통계

파이프는 공개된 수치로 분포를 맞추고, 시드로 가공의 회사를 만든다. 원본 파일은 저장소에 넣지 않는다. [데이터 사용 메모](../legal/data-usage.md).

## 이름

회사 이름은 Faker의 회사 이름 로캘을 쓰지 않는다. 실존 상호와 비슷해지는 경로이기 때문이다. 생성기는 자체 형태소와 거절 목록을 쓴다.

- Faker (JavaScript): <https://fakerjs.dev/> 저장소 <https://github.com/faker-js/faker> MIT. 사건 번호, 날짜, 더미 문장처럼 회사를 식별하지 않는 텍스트에만 검토한다.
- Faker (Python): <https://github.com/joke2k/faker> 문서 <https://faker.readthedocs.io/en/master/> MIT. 같은 제한.
- unique-names-generator: <https://github.com/andreasonny83/unique-names-generator> MIT. 영어 단어 조합의 패턴 참고. 한국어 상호의 재료로 쓰지 않는다.

## Damodaran

- 데이터 안내: <https://pages.stern.nyu.edu/~adamodar/New_Home_Page/data.html>
- 홈: <https://pages.stern.nyu.edu/~adamodar/>
- 비용: 페이지에 공개된 집계. 회사별 원자료는 더 이상 배포하지 않는다고 2026-01-09 갱신 안내가 적는다.
- 이유: 섹터 배수, 마진, 자본 구조의 **국가·산업 집계**를 자리표시자 파라미터와 비교할 때. About Data의 사용 규칙을 따른다. 한국 비상장 분포의 대체재는 아니다.

## 한국

- KOSIS 영문: <https://kosis.kr/eng/>
- OpenAPI 활용 조건: <https://kosis.kr/openapi/introduce/introduce_02List.do>
- 이유: 산업, 사업체, 물가의 분포. 개인 회원과 출처 표시, 원본 유료 재배포 금지를 지킨다. 받은 표를 게임에 넣지 않고 파라미터만 남긴다.
- 한국은행 ECOS: <https://ecos.bok.or.kr/> 금리 국면의 수준을 잡을 때. 이 점검에서 약관 본문은 요약하지 않았다. 적합 전에 읽는다.
- DART: <https://opendart.fss.or.kr/>
- OpenDART 영문 소개: <https://engopendart.fss.or.kr/intro/main.do>
- OpenDART 약관: <https://engopendart.fss.or.kr/intro/terms.do>
- 이유: 업종별 계정 분포. 인증키가 필요하다. 원문 XML과 서술형 주석은 가져오지 않는다. 개별 회사의 계정 나열을 생성 결과에 남기지 않는다.

## 미국과 국제 통계

- BLS API 시작: <https://www.bls.gov/developers/home.htm> 공개 API. v2는 등록이 필요하다고 적혀 있다. 미국 노동·물가 시계열로 사이클의 폭을 가늠한다. 한국 섹터의 본체가 아니다.
- SEC EDGAR 접근: <https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data> 단순 클라이언트는 403이었고, 브라우저형 조회에서 본문을 확인했다. 초당 10요청, User-Agent 선언, 필요한 것만. XBRL 수치가 대상이고 10-K 산문은 대상이 아니다.
- XBRL International: <https://www.xbrl.org/> 택사노미를 읽는 표준 기구. 데이터 덤프가 아니다.
- FRED API: <https://fred.stlouisfed.org/docs/api/fred/> 사이트 <https://fred.stlouisfed.org/> 금리와 스프레드. API 키 절이 문서에 있다. 재배포 조건은 적합 전에 약관을 다시 읽는다.
- OECD 데이터 탐색기: <https://data-explorer.oecd.org/> 포털의 영문 데이터 경로는 403이라 여기만 올린다. 국가 간 마진·투자율의 넓은 비교.
- World Bank 데이터: <https://data.worldbank.org/> 예전 데이터셋 약관 주소는 <https://www.worldbank.org/ext/en/legal/terms-conditions> 로 이어졌다. 표의 재배포와 분포 추정은 다르므로, 사용 전에 이 약관을 읽는다.
- IMF 데이터: <https://www.imf.org/en/Data> 거시 시계열의 입구. 이 점검에서 이용 약관 본문은 확인하지 못했다.

## 적합할 때 남기는 것

시드, 분포 버전, 표본 수, 제외한 극단값, 사람이 리뷰한 날짜. 회사 식별자, 원문, 다운로드 원본은 남기지 않는다.
