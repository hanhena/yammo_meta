# NAI Metadata Reader (private static build)

브라우저 안에서 이미지 메타데이터를 읽는 정적 웹앱입니다. 서버 업로드가 없으므로 GitHub Pages에 그대로 올려 사용할 수 있습니다.

## 지원

- PNG `tEXt`, `zTXt`, `iTXt`, `eXIf`
- NovelAI 공식 alpha LSB `stealth_pngcomp`
- `stealth_pnginfo`
- RGB LSB `stealth_rgbcomp`, `stealth_rgbinfo`
- WebP EXIF / JPEG EXIF의 주요 텍스트 필드 및 UserComment
- NovelAI V4/V4.5 계열 `v4_prompt.caption.char_captions`
- 캐릭터별 negative prompt (`v4_negative_prompt.caption.char_captions`)
- 개별 복사 / 전체 복사 / 프롬프트 중복 제거 / 여러 이미지 목록 / 미리보기 크기 / 다크 모드

## GitHub Pages 배포

1. 새 GitHub 저장소 생성
2. 이 폴더의 `index.html`, `styles.css`, `app.js`를 저장소 루트에 업로드
3. GitHub 저장소의 **Settings → Pages**
4. **Deploy from a branch** 선택
5. `main` 브랜치와 `/ (root)` 선택 후 저장
6. 표시되는 `https://<아이디>.github.io/<저장소명>/` 주소 사용

> GitHub Pages는 공개 URL입니다. 별도 인증은 이 버전에 포함되어 있지 않습니다. 이미지는 외부 서버로 전송하지 않고 방문한 브라우저에서만 처리됩니다.

## 구현 참고 / 라이선스

Stealth metadata 디코딩 방식은 NovelAI의 공개 `novelai-image-metadata` 구현과 `sd-webui-stealth-pnginfo` 계열의 공개 포맷을 참고해 JavaScript로 재구현했습니다. NovelAI 공개 메타데이터 저장소는 MIT License입니다.
