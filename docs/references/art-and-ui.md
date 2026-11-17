# 그림과 UI

큰 팩은 저장소에 넣지 않는다. 파일을 더하기 전에 그 팩의 라이선스 문장을 크레딧 목록에 옮긴다.

## Kenney

- 목록: <https://kenney.nl/assets>
- 예시: Tiny Factory 팩 페이지의 소개 문구가 “CC0 licensed”라고 적는다. <https://kenney.nl/assets/tiny-factory>
- 라이선스: 무료 팩 페이지가 CC0라고 밝힌다. CC0 본문 <https://creativecommons.org/publicdomain/zero/1.0/> 팩마다 문구가 같은지 다운로드 때 다시 본다. itch의 유료 번들은 그 상품의 조건이 따로다.
- 이유: 공장, 도시, UI, 입력 프롬프트의 자리표시자. 우리 카드의 최종 그림으로 그대로 쓰지 않고, 파이프라인과 프로토타입의 형태 언어로 본다.

## itch.io 에셋

- 목록: <https://itch.io/game-assets>
- 사이트 약관: <https://itch.io/docs/legal/terms>
- 라이선스: 팩마다 다르다. 사이트 약관이 팩을 CC0로 만들어 주지 않는다.
- 이유: 유료·무료 팩을 찾을 때의 입구. 구매 페이지의 허가 범위를 적기 전에는 쓰지 않는다.

## game-icons.net

- 주소: <https://game-icons.net/>
- 고지: <https://github.com/game-icons/icons/blob/master/license.txt>
- 라이선스: 기본적으로 CC BY 3.0. 일부 작가는 CC0. “Icons made by {author}” 형태의 표시를 요구한다. CC BY 3.0 본문 <https://creativecommons.org/licenses/by/3.0/>
- 이유: 딜 유형, 이벤트, 자산 종류의 작은 아이콘. 표시 문장을 크레딧에 넣는다.

## Lucide

- 주소: <https://lucide.dev/>
- 라이선스 페이지: <https://lucide.dev/license>
- 라이선스: 프로젝트는 ISC로 배포되고, Feather에서 온 아이콘은 MIT로 남는다고 고지된다. 페이지 본문의 목록을 크레딧에 반영한다.
- 이유: 인터페이스 아이콘. 게임 그림과 섞지 않는다.

## OpenMoji

- 주소: <https://openmoji.org/>
- FAQ의 라이선스: <https://openmoji.org/faq/>
- 라이선스: CC BY-SA 4.0. <https://creativecommons.org/licenses/by-sa/4.0/> 고지와 동일조건변경허락. 고친 이모지를 우리만의 독점 에셋으로 닫을 수 없다.
- 이유: 프로토타입의 상태 아이콘. 동일조건이 게임 아트 전체에 번지지 않게, 최종 그림에는 쓰지 않는 쪽을 기본으로 한다.

## Quaternius

- 라이선스: <https://quaternius.com/license.html>
- 조건: Quaternius Asset License v1.0 (2026-08-28). 게임 안의 사용은 무료이고 크레딧은 필수가 아니다. 에셋 자체의 재배포와 재판매는 금지다. CC0가 아니다.
- 이유: 낮은 폴리곤의 설비·건물 프로토타입. 팩을 저장소에 풀지 않는다.

## OpenGameArt

- FAQ: <https://opengameart.org/content/faq>
- 라이선스: 작품마다 다르다.
- 이유: CC0와 CC BY를 거를 때의 2차 입구. 작품 페이지의 라이선스가 팩 전체의 라이선스라고 가정하지 않는다.

## Natural Earth

- 주소: <https://www.naturalearthdata.com/>
- 이용 조건: 퍼블릭 도메인. <https://www.naturalearthdata.com/about/terms-of-use/>
- 이 저장소: `public/atlas/world.json`은 110m 국가와 10m 행정구역을 좌표만 남겨 줄인 것이다. 타일 서버는 부르지 않는다. 프랑스 레지옹과 영국 구성국은 하위 경계를 합쳐 그렸다.

## 한글 글꼴

- Pretendard: <https://github.com/orioncactus/pretendard> SIL Open Font License. 예약된 글꼴 이름 Pretendard. 글꼴 파일은 팔지 않고, 이름을 유지한 채 조건에 맞게 임베드한다. OFL 안내 <https://openfontlicense.org/>
- Noto: <https://fonts.google.com/noto> 한글을 포함한 패밀리. SIL OFL로 배포된다. Pretendard가 화면 크기에서 부족할 때의 본문 대안이다.
- 이유: 글꼴 파일은 저장소에 넣지 않는다. 화면은 Pretendard Variable 동적 서브셋을 jsDelivr로 링크하고, 실패하면 Apple SD Gothic Neo와 Malgun Gothic으로 떨어진다. 토큰은 [화면 토큰](../design/tokens.md)이다.

화면은 따뜻한 종이 바탕과 흰 카드, 그리고 카민 `#9B1B30` 하나다. 상단 바, 아래 탭, 지도 메모, 시트만 유리층이다. 탭과 테마 아이콘은 Lucide다. 섹터 픽토그램, 모노그램, 사업장 선화는 이 저장소에서 그린 SVG다. 장식 그라데이션은 쓰지 않는다. 숫자를 불러오는 스켈레톤만 옅게 반짝인다.
