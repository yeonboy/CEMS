#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
수리내역logs.xlsx 파일을 UTF-8 인코딩의 CSV로 변환하는 스크립트
"""

import pandas as pd
import os

def convert_repair_logs():
    # 파일 경로
    input_file = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀", "수리내역logs.xlsx")
    output_file = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀", "수리내역logs.csv")
    
    try:
        # Excel 파일 읽기
        print(f"Excel 파일 읽는 중: {input_file}")
        df = pd.read_excel(input_file)
        
        print(f"원본 헤더: {list(df.columns)}")
        print(f"데이터 행 수: {len(df)}")
        print(f"데이터 열 수: {len(df.columns)}")
        
        # 처음 몇 행 출력하여 확인
        print("\n처음 5행:")
        print(df.head())
        
        # 데이터 타입 확인
        print(f"\n데이터 타입:")
        print(df.dtypes)
        
        # UTF-8로 CSV 저장
        df.to_csv(output_file, encoding='utf-8', index=False)
        
        print(f"\n✅ 변환 완료: {output_file}")
        print(f"파일 크기: {os.path.getsize(output_file) / 1024:.1f} KB")
        
        # 변환된 CSV 파일의 처음 몇 행 확인
        print(f"\n변환된 CSV 파일 확인:")
        df_check = pd.read_csv(output_file, encoding='utf-8')
        print(df_check.head())
        
        return True
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        return False

if __name__ == "__main__":
    convert_repair_logs()
