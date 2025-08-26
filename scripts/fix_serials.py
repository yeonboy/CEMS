#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
serials.csv 파일의 한글 깨짐을 수정하는 스크립트
"""

import pandas as pd
import os

def fix_serials_csv():
    # 파일 경로
    input_file = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀", "serials.csv")
    output_file = input_file.replace('.csv', '_fixed.csv')
    
    try:
        # cp949 인코딩으로 읽기 (한국어 Windows 기본 인코딩)
        df = pd.read_csv(input_file, encoding='cp949')
        
        print(f"원본 헤더: {list(df.columns)}")
        print(f"데이터 행 수: {len(df)}")
        
        # 올바른 헤더로 변경
        df.columns = ['번호', '품목계열', '시리얼번호']
        
        # UTF-8로 저장
        df.to_csv(output_file, encoding='utf-8', index=False)
        
        print(f"✅ 파일 수정 완료: {output_file}")
        print(f"수정된 헤더: {list(df.columns)}")
        
        # 처음 몇 행 출력하여 확인
        print("\n처음 10행:")
        print(df.head(10))
        
        return True
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        return False

if __name__ == "__main__":
    fix_serials_csv()
