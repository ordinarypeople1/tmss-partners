# 지도와 지리 데이터

밑바탕은 실제 지리, 핀은 가공의 단지다. 사업체 이름과 POI는 스타일에서 뺀다. 좌표는 소수 둘째 자리보다 정밀하게 두지 않는다.

## Natural Earth

- 주소: <https://www.naturalearthdata.com/>
- 이용 조건: <https://www.naturalearthdata.com/about/terms-of-use/>
- 라이선스: 퍼블릭 도메인. 허가가 필요 없고, 크레딧도 필수는 아니라고 적혀 있다. 일부 원천 데이터는 Natural Earth에만 한정된 이용 허락이 있으므로, 그 페이지의 원천 절을 읽고 우리 파이프가 그 원천을 직접 받지 않게 한다.
- 이유: 세계 육지와 한국·일본·중국·대만·미국·영국·프랑스·독일의 상위 행정구역. `public/atlas/world.json`으로 줄여 두고, 런타임에 타일을 받지 않는다.

## OpenStreetMap

- 저작권 안내: <https://www.openstreetmap.org/copyright>
- ODbL 1.0: <https://opendatacommons.org/licenses/odbl/1-0/>
- 라이선스: 데이터베이스는 ODbL. 저작권 있는 기여는 별도. 파생 데이터베이스를 공개 배포하면 공유 조건이 따른다. 화면에는 © OpenStreetMap 고지가 필요하다.
- 이유: 도로와 산업 지역의 형태. 상호·POI를 포함한 채 배포하지 않는다. 타일을 직접 구우면 ODbL 의무를 설계에 넣는다.

## MapLibre GL JS

- 주소: <https://maplibre.org/>
- 저장소: <https://github.com/maplibre/maplibre-gl-js>
- 라이선스: BSD-3-Clause. Mapbox GL JS 1.13 이전 코드가 포함된다. 그 이후의 비오픈 Mapbox 코드를 가져오지 않는다.
- 이유: 고른 지도 렌더러. 오프라인 스타일과 벡터 타일을 받는다.

## d3-geo

- 저장소: <https://github.com/d3/d3-geo>
- 라이선스: ISC (저작권 Mike Bostock, 허가 고지 유지).
- 이유: 타일 없이 행정구역을 SVG로 그릴 때의 투영. 웹 클라이언트의 대안 경로이며, 지금 의존성은 아니다.

## deck.gl

- 주소: <https://deck.gl/>
- 라이선스: MIT.
- 이유: 회사·자산이 많아지면 핀 레이어의 후보. 지금 핀은 MapLibre 마커로 그린다.

## PMTiles와 Protomaps

- PMTiles: <https://github.com/protomaps/PMTiles>
- 라이선스: 구현은 BSD-3-Clause. 명세는 퍼블릭 도메인 또는 CC0. 저장소 안의 샘플 타일은 따로 라이선스가 있다고 파일에 적혀 있다.
- 베이스맵 데이터 고지: <https://github.com/protomaps/basemaps/blob/main/LICENSE_DATA.md>
- 사이트: <https://protomaps.com/>
- 이유: 하나의 파일로 된 오프라인 벡터 타일. 기본 베이스맵은 OSM(ODbL)과 Natural Earth를 포함하고, 토지피복 레이어를 켜면 ESA WorldCover의 CC BY 4.0이 따른다고 고지 파일이 적는다. 게임 스타일에서는 이름 레이어를 빼고, 남기는 레이어의 고지를 크레딧에 모은다.

## geoBoundaries

- 주소: <https://www.geoboundaries.org/>
- 라이선스: CC BY 4.0. 앱이라면 크레딧에 geoBoundaries와 주소를 넣으라고 안내한다.
- 이유: 시·도 경계. Natural Earth보다 행정구역 놀이에 가깝다. 상업적 이용이 허용되고 표시가 조건이다.

## GADM

- 라이선스 페이지: <https://gadm.org/license.html>
- 조건: 학술과 그 밖의 비상업 이용은 무료. 재배포와 상업적 이용은 사전 허가가 필요하다고 적혀 있다. 오스트리아 등 일부 국가는 더 좁다.
- 이유: 쓰지 않기 위해 올린다. 상업 게임에 부적합하다.

## 한국 공개 데이터

- 공공데이터포털: <https://www.data.go.kr/>
- 공공누리 유형 안내: <https://www.kogl.or.kr/info/license.do> 데이터셋마다 출처 표시, 상업적 이용, 변경 허용이 다르다. 파일을 받기 전에 그 데이터셋의 유형을 적는다.
- 통계지리정보: <https://sgis.mods.go.kr/> 예전 주소 `sgis.kostat.go.kr`이 여기로 이어졌다. 통계청 소개 경로 `kostat.go.kr/anse`는 <https://mods.go.kr/anse/> 로 이어졌다. 경계 파일의 이용 조건은 다운로드 화면에서 다시 확인한다.
- 이유: 시·도보다 자세한 경계가 필요할 때의 1차 후보. 브이월드는 이 환경에서 연결이 끊겨 목록에 넣지 않았다.

## 타일을 굽는 도구

- QGIS: <https://qgis.org/> 데스크톱 도구다. QGIS 프로그램 자체는 GPL이다. 엔진에 링크하지 않고, 허용된 입력으로 우리 파일을 만들 때만 쓴다.
- OpenMapTiles 도구 저장소: <https://github.com/openmaptiles/openmaptiles> OSM으로 타일을 만드는 스키마와 도구. 결과물은 OSM의 ODbL을 따른다. MapTiler가 호스팅하는 타일 상품은 이 저장소와 다른 계약이다. 그 상품을 게임 안에 넣는다고 가정하지 않는다.

## 이 게임이 지도에서 하지 않는 것

실존 공장 폴리곤에 가공 회사를 겹치지 않는다. 위성 사진으로 특정 사업장을 알아보게 하지 않는다. 상호 검색을 넣지 않는다.
