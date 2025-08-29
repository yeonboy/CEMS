
import pandas as pd
import json
import os

def process_data():
    # Define file paths
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    serials_path = os.path.join(base_path, '청명장비 엑셀', 'serials.csv')
    logs_path = os.path.join(base_path, '청명장비 엑셀', 'logs.csv')
    output_path = os.path.join(base_path, 'db', 'equipment_data.json')

    # Read CSV files with appropriate encoding
    try:
        serials_df = pd.read_csv(serials_path, encoding='cp949')
        logs_df = pd.read_csv(logs_path, encoding='cp949', header=None)
    except UnicodeDecodeError:
        serials_df = pd.read_csv(serials_path, encoding='utf-8')
        logs_df = pd.read_csv(logs_path, encoding='utf-8', header=None)

    # Manually set column names
    serials_df.columns = ['index', '품목계열', '시리얼번호']
    logs_df.columns = ['날짜', '출고처', '입고처', '품목', '시리얼번호', '수량', '기타', '비고']

    # Get the latest log for each serial number
    latest_logs = logs_df.sort_values(by='날짜', ascending=False).drop_duplicates(subset='시리얼번호')

    # Merge with serials data
    equipment_data = pd.merge(serials_df, latest_logs, on='시리얼번호', how='left')

    # Determine status based on location
    def get_status(location):
        if pd.isna(location):
            return '대기중'
        if '업체' in str(location):
            return '수리중'
        elif '청명' in str(location):
            return '대기중'
        elif '현장' in str(location):
            return '가동중'
        else:
            return '확인필요'

    equipment_data['상태'] = equipment_data['입고처'].apply(get_status)

    # Convert to JSON
    result = equipment_data.to_json(orient='records', force_ascii=False)

    # Save to file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(result)

    print(f"Data processed and saved to {output_path}")

if __name__ == '__main__':
    process_data()
