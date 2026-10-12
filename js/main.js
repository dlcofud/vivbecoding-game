/* 공용: 블록 작업대와 토큰 변환기를 화면에 붙이고 서로 연결합니다. */
Converter.mount(document.getElementById("converter"));
Blocks.onChange(Converter.update);
Blocks.mount(document.getElementById("workbench"));
