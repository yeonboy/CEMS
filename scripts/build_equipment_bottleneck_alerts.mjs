// 장비 병목 위험 알림 생성기
// 4분기 내 특정 기간에 집중되는 사업들로 인한 장비 부족 위험을 분석하고 알림 생성
// 입력: business_contracts_overrides.json, stats_business_item_timeseries_q4_2025.json, equipment_db.json
// 출력: db/equipment_bottleneck_alerts.json

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, 'db');

// 입력 파일들
const OVERRIDES_FILE = path.join(DB_DIR, 'business_contracts_overrides.json');
const TIMESERIES_FILE = path.join(DB_DIR, 'stats_business_item_timeseries_q4_2025.json');
const EQUIPMENT_FILE = path.join(DB_DIR, 'equipment_db.json');

// 출력 파일
const OUTPUT_FILE = path.join(DB_DIR, 'equipment_bottleneck_alerts.json');

// 4분기 월별 영업일 수
const Q4_MONTHS = {
  '2025-10': 23,
  '2025-11': 21, 
  '2025-12': 22
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`파일 읽기 실패: ${filePath}`, error.message);
    return null;
  }
}

function ensureArray(data) {
  return Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : []);
}

function normalizeItemName(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  if (s.startsWith('PM10') || s === 'PM-10') return 'PM-10';
  if (s.startsWith('PM2.5') || s === 'PM-2.5' || s === 'PM2_5') return 'PM-2.5';
  if (s === 'NOX') return 'NO2';
  if (s === 'NO2') return 'NO2';
  if (s === 'SOX' || s === 'SO2') return 'SO2';
  if (s === 'CO') return 'CO';
  if (s === 'O3') return 'O3';
  if (s === 'PB' || s === 'PB(LEAD)') return 'Pb';
  if (raw && String(raw).includes('벤젠')) return '벤젠';
  return raw;
}

// 측정 항목별 특수 운영 방식
function getItemOperationMode(item) {
  switch (item) {
    case '벤젠':
      return {
        mode: 'single_per_project',
        description: '사업당 1개만 사용 (지점 수 무관)',
        riskMultiplier: 1.2 // 벤젠은 대체 어려워 위험도 높음
      };
    default:
      return {
        mode: 'sites_per_device',
        description: '지점 수만큼 장비 필요',
        riskMultiplier: 1.0
      };
  }
}

// 장비 인벤토리 구축
function buildEquipmentInventory(equipment) {
  const itemInventory = new Map();
  
  for (const eq of equipment) {
    const serial = (eq?.serial || '').toString().trim();
    if (!serial) continue;
    
    const category = (eq?.category || '').toString();
    const match = category.match(/^\(([^)]+)\)/);
    
    let items = [];
    if (match) {
      items = match[1].split(',').map(item => normalizeItemName(item)).filter(Boolean);
    }
    if (!items.length) items = ['UNKNOWN'];
    
    for (const item of items) {
      itemInventory.set(item, (itemInventory.get(item) || 0) + 1);
    }
  }
  
  return itemInventory;
}

// 오버라이드가 적용된 월별 수요 분석
function analyzeMonthlyDemandWithOverrides(timeseries, overrides) {
  const overrideMap = new Map();
  overrides.forEach(ovr => {
    if (ovr.projectId && ovr.overrides) {
      overrideMap.set(ovr.projectId, ovr.overrides);
    }
  });

  const monthlyDemand = new Map(); // month -> item -> { totalDevices, projects, peakDay }

  for (const row of timeseries) {
    if (!Q4_MONTHS[row.month]) continue;

    const projectId = row.projectId;
    const override = overrideMap.get(projectId);
    
    if (override && override.selectedItems && override.items) {
      // 오버라이드 적용
      for (const itemName of override.selectedItems) {
        const itemData = override.items[itemName];
        if (!itemData) continue;
        
        const item = normalizeItemName(itemName);
        const operationMode = getItemOperationMode(item);
        
        let devicesNeeded;
        if (operationMode.mode === 'single_per_project') {
          devicesNeeded = 1; // 벤젠은 사업당 1개
        } else {
          devicesNeeded = itemData.requiredDevices || 0;
        }
        
        if (devicesNeeded === 0) continue;
        
        const monthKey = row.month;
        if (!monthlyDemand.has(monthKey)) {
          monthlyDemand.set(monthKey, new Map());
        }
        
        const monthData = monthlyDemand.get(monthKey);
        if (!monthData.has(item)) {
          monthData.set(item, {
            totalDevices: 0,
            projects: [],
            peakDay: 0,
            operationMode: operationMode.description
          });
        }
        
        const itemData_month = monthData.get(item);
        itemData_month.totalDevices += devicesNeeded;
        itemData_month.projects.push({
          projectId,
          projectName: row.projectName || projectId,
          devicesNeeded,
          siteDays: itemData.requiredSiteDays || 0,
          override: true
        });
        
        // 일일 최대 수요 추정 (사이트데이를 월 영업일로 나눔)
        const dailyDemand = Math.ceil((itemData.requiredSiteDays || 0) / Q4_MONTHS[monthKey]);
        itemData_month.peakDay = Math.max(itemData_month.peakDay, dailyDemand);
      }
    } else {
      // 원본 데이터 사용
      const item = normalizeItemName(row.category || '');
      if (!item) continue;
      
      const operationMode = getItemOperationMode(item);
      let devicesNeeded;
      
      if (operationMode.mode === 'single_per_project') {
        devicesNeeded = 1;
      } else {
        devicesNeeded = row.requiredDevices || 0;
      }
      
      if (devicesNeeded === 0) continue;
      
      const monthKey = row.month;
      if (!monthlyDemand.has(monthKey)) {
        monthlyDemand.set(monthKey, new Map());
      }
      
      const monthData = monthlyDemand.get(monthKey);
      if (!monthData.has(item)) {
        monthData.set(item, {
          totalDevices: 0,
          projects: [],
          peakDay: 0,
          operationMode: operationMode.description
        });
      }
      
      const itemData_month = monthData.get(item);
      itemData_month.totalDevices += devicesNeeded;
      itemData_month.projects.push({
        projectId,
        projectName: row.projectName || projectId,
        devicesNeeded,
        siteDays: row.requiredSiteDays || 0,
        override: false
      });
      
      const dailyDemand = Math.ceil((row.requiredSiteDays || 0) / Q4_MONTHS[monthKey]);
      itemData_month.peakDay = Math.max(itemData_month.peakDay, dailyDemand);
    }
  }
  
  return monthlyDemand;
}

// 병목 위험 분석 및 알림 생성
function generateBottleneckAlerts(monthlyDemand, inventory) {
  const alerts = [];
  
  for (const [month, itemMap] of monthlyDemand) {
    for (const [item, demandData] of itemMap) {
      const available = inventory.get(item) || 0;
      const needed = demandData.totalDevices;
      const peakDaily = demandData.peakDay;
      const operationMode = getItemOperationMode(item);
      
      // 위험도 계산
      let riskLevel = 'low';
      let alertType = 'info';
      let message = '';
      
      const utilizationPct = available > 0 ? Math.round((needed / available) * 100) : 999;
      const shortage = Math.max(0, needed - available);
      
      if (shortage > 0) {
        riskLevel = 'critical';
        alertType = 'error';
        message = `${month}에 ${item} 측정기가 ${shortage}대 부족할 예정입니다.`;
      } else if (utilizationPct >= 90) {
        riskLevel = 'high';
        alertType = 'warning';
        message = `${month}에 ${item} 측정기 사용률이 ${utilizationPct}%로 매우 높습니다.`;
      } else if (utilizationPct >= 70) {
        riskLevel = 'medium';
        alertType = 'warning';
        message = `${month}에 ${item} 측정기 사용률이 ${utilizationPct}%입니다.`;
      }
      
      if (riskLevel !== 'low') {
        // 위험한 사업들 식별 (상위 기여도)
        const sortedProjects = demandData.projects
          .sort((a, b) => b.devicesNeeded - a.devicesNeeded)
          .slice(0, 3);
        
        const alert = {
          id: `${month}-${item}-${Date.now()}`,
          type: alertType,
          category: 'equipment_bottleneck',
          month,
          item,
          riskLevel,
          message,
          details: {
            available,
            needed,
            shortage,
            utilizationPct,
            peakDaily,
            operationMode: operationMode.description,
            affectedProjects: demandData.projects.length,
            topProjects: sortedProjects.map(p => ({
              projectName: p.projectName,
              devicesNeeded: p.devicesNeeded,
              siteDays: p.siteDays,
              hasOverride: p.override
            }))
          },
          recommendations: generateRecommendations(item, shortage, utilizationPct, operationMode, sortedProjects),
          createdAt: new Date().toISOString(),
          priority: riskLevel === 'critical' ? 1 : riskLevel === 'high' ? 2 : 3
        };
        
        alerts.push(alert);
      }
    }
  }
  
  return alerts.sort((a, b) => a.priority - b.priority);
}

// 권장사항 생성
function generateRecommendations(item, shortage, utilizationPct, operationMode, topProjects) {
  const recommendations = [];
  
  if (shortage > 0) {
    recommendations.push(`${shortage}대의 ${item} 측정기 추가 확보가 필요합니다.`);
    
    if (operationMode.mode === 'single_per_project') {
      recommendations.push(`${item}은 사업당 1대만 필요하므로 일정 조정으로 해결 가능합니다.`);
    }
    
    if (topProjects.length > 1) {
      recommendations.push(`주요 사업들의 일정을 분산시키는 것을 고려해보세요.`);
    }
  } else if (utilizationPct >= 90) {
    recommendations.push('여유분 확보를 위해 추가 장비 구매를 검토하세요.');
    recommendations.push('사업 일정을 다른 월로 분산하는 것을 고려하세요.');
  } else if (utilizationPct >= 70) {
    recommendations.push('상황을 모니터링하고 필요시 일정 조정을 준비하세요.');
  }
  
  return recommendations;
}

function main() {
  console.log('🚨 장비 병목 위험 알림 생성 시작...');
  
  // 데이터 로드
  const overrides = ensureArray(readJson(OVERRIDES_FILE));
  const timeseries = ensureArray(readJson(TIMESERIES_FILE));
  const equipment = ensureArray(readJson(EQUIPMENT_FILE));
  
  console.log(`📊 데이터 로드: 오버라이드 ${overrides.length}개, 타임시리즈 ${timeseries.length}행, 장비 ${equipment.length}개`);
  
  // 장비 인벤토리 구축
  const inventory = buildEquipmentInventory(equipment);
  console.log(`🏭 장비 인벤토리: ${inventory.size}개 항목`);
  
  // 월별 수요 분석 (오버라이드 반영)
  const monthlyDemand = analyzeMonthlyDemandWithOverrides(timeseries, overrides);
  console.log(`📅 월별 수요 분석: ${Array.from(monthlyDemand.keys()).join(', ')}`);
  
  // 병목 위험 알림 생성
  const alerts = generateBottleneckAlerts(monthlyDemand, inventory);
  console.log(`🚨 생성된 알림: ${alerts.length}개`);
  
  // 알림별 요약
  const summary = {
    total: alerts.length,
    critical: alerts.filter(a => a.riskLevel === 'critical').length,
    high: alerts.filter(a => a.riskLevel === 'high').length,
    medium: alerts.filter(a => a.riskLevel === 'medium').length,
    byMonth: {}
  };
  
  for (const month of Object.keys(Q4_MONTHS)) {
    const monthAlerts = alerts.filter(a => a.month === month);
    summary.byMonth[month] = {
      total: monthAlerts.length,
      critical: monthAlerts.filter(a => a.riskLevel === 'critical').length,
      items: Array.from(new Set(monthAlerts.map(a => a.item)))
    };
  }
  
  // 결과 저장
  const output = {
    meta: {
      _schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      quarter: '2025-Q4',
      sources: [
        'db/business_contracts_overrides.json',
        'db/stats_business_item_timeseries_q4_2025.json',
        'db/equipment_db.json'
      ],
      methodology: 'monthly_demand_vs_inventory_with_overrides',
      summary
    },
    alerts
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  
  console.log(`✅ 병목 위험 알림 생성 완료: ${OUTPUT_FILE}`);
  console.log(`📊 요약: 총 ${alerts.length}개 (위험 ${summary.critical}개, 높음 ${summary.high}개, 중간 ${summary.medium}개)`);
  
  // 월별 요약 출력
  for (const [month, data] of Object.entries(summary.byMonth)) {
    if (data.total > 0) {
      console.log(`📅 ${month}: ${data.total}개 알림 (위험 ${data.critical}개) - ${data.items.join(', ')}`);
    }
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1].includes('build_equipment_bottleneck_alerts.mjs')) {
  main();
}
