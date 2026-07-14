const axios = require('axios');
const dayjs = require('dayjs');
const colors = require('colors');

const getNightscoutToken = function (token) {
  if (token && token.trim() !== '') {
    return `&token=${token.trim()}`;
  }
  return '';
};

const toISO = (dateStr) => dayjs(dateStr).startOf('day').toISOString();

const getNightscoutFoodEntries = async function (baseUrl, token, fromDate, toDate) {
  const isoFrom = toISO(fromDate);
  const isoTo = dayjs(toDate).endOf('day').toISOString();

  const fetch = async (type) => {
    const url = `${baseUrl}/api/v1/treatments.json?find[created_at][$gte]=${isoFrom}&find[created_at][$lte]=${isoTo}&find[eventType]=${encodeURIComponent(type)}&count=131072${getNightscoutToken(token)}`;
    console.log(`[FOOD] Request: ${url}`.gray);
    const response = await axios.get(url);
    return response.data.map(d => ({
      id: parseInt(`2${dayjs(d.created_at).format('YYYYMMDDHHmmss')}`),
      timestamp: d.created_at,
      carbs: d.carbs
    }));
  };

  const data1 = await fetch('Meal Bolus');
  const data2 = await fetch('Carb Correction');

  return [...data1, ...data2].filter(e => e.carbs > 0).map(e => ({
    extendedProperties: { factoryTimestamp: e.timestamp },
    recordNumber: e.id,
    timestamp: dayjs(e.timestamp).format('YYYY-MM-DDTHH:mm:ss'),
    gramsCarbs: e.carbs,
    foodType: "Unknown"
  }));
};

const getNightscoutInsulinEntries = async function (baseUrl, token, fromDate, toDate) {
  const isoFrom = toISO(fromDate);
  const isoTo = dayjs(toDate).endOf('day').toISOString();

  const fetch = async (type) => {
    const url = `${baseUrl}/api/v1/treatments.json?find[created_at][$gte]=${isoFrom}&find[created_at][$lte]=${isoTo}&find[eventType]=${encodeURIComponent(type)}&count=131072${getNightscoutToken(token)}`;
    console.log(`[INSULIN] Request: ${url}`.gray);
    const response = await axios.get(url);
    return response.data.map(d => ({
      id: parseInt(`4${dayjs(d.created_at).format('YYYYMMDDHHmmss')}`),
      timestamp: d.created_at,
      insulin: d.insulin
    }));
  };

  const data1 = await fetch('Correction Bolus');
  const data2 = await fetch('Meal Bolus');

  return [...data1, ...data2].filter(e => e.insulin > 0).map(e => ({
    extendedProperties: { factoryTimestamp: e.timestamp },
    recordNumber: e.id,
    timestamp: dayjs(e.timestamp).format('YYYY-MM-DDTHH:mm:ss'),
    units: e.insulin,
    insulinType: "RapidActing"
  }));
};


const getNightscoutGlucoseEntries = async function (baseUrl, token, fromDate, toDate) {
  const fromMills = dayjs(fromDate).startOf('day').valueOf();
  const toMills = dayjs(toDate).endOf('day').valueOf();
  
  const url = `${baseUrl}/api/v1/entries.json?find[date][$gte]=${fromMills}&find[date][$lte]=${toMills}&count=131072${getNightscoutToken(token)}`;
  
  console.log(`[DEBUG] Request URL: ${url}`.gray);
  const response = await axios.get(url);
  
  let processed = response.data
    .filter((d, index, self) => 
      index === 0 || d.date !== self[index - 1].date
    )
    .filter((_, i) => i % 2 === 0) 
    .map(d => ({
      extendedProperties: { factoryTimestamp: dayjs(d.date).toISOString(), canMerge: "true" },
      recordNumber: parseInt(`1${dayjs(d.date).format('YYYYMMDDHHmmss')}`),
      timestamp: dayjs(d.date).format('YYYY-MM-DDTHH:mm:ss'),
      valueInMgPerDl: d.sgv
    }));

  console.log(`[DEBUG] После очистки отправляется записей: ${processed.length}`.cyan);
  return processed;
};

const selectUnscheduled = function (entries) {
  const result = [];
  const groups = entries.reduce((acc, entry) => {
    const day = dayjs(entry.timestamp).format('YYYY-MM-DD');
    if (!acc[day]) acc[day] = [];
    acc[day].push(entry);
    return acc;
  }, {});

  for (const dayEntries of Object.values(groups)) {
    // Количество точек пик-пик
    const count = Math.floor(Math.random() * (12 - 6 + 1)) + 6; 
    const sortedEntries = dayEntries.sort((a, b) => dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf());
    const slotSize = Math.floor(sortedEntries.length / count);
    
    if (slotSize === 0) {
      result.push(...sortedEntries);
    } else {
      for (let i = 0; i < count; i++) {
        // Берем случайную запись из каждого конкретного временного интервала
        const start = i * slotSize;
        const end = (i === count - 1) ? sortedEntries.length : (i + 1) * slotSize;
        const subSlot = sortedEntries.slice(start, end);
        
        if (subSlot.length > 0) {
          const randomIndex = Math.floor(Math.random() * subSlot.length);
          result.push(subSlot[randomIndex]);
        }
      }
    }
  }
  return result;
};

const getNightscoutAllEntries = async function (baseUrl, token, fromDate, toDate) {
  const glucose = await getNightscoutGlucoseEntries(baseUrl, token, fromDate, toDate);
  const food = await getNightscoutFoodEntries(baseUrl, token, fromDate, toDate);
  const insulin = await getNightscoutInsulinEntries(baseUrl, token, fromDate, toDate);
  
  return { 
    glucoseEntriesScheduled: glucose, 
    glucoseEntriesUnscheduled: selectUnscheduled(glucose),
    foodEntries: food, 
    insulinEntries: insulin 
  };
};

exports.getNightscoutFoodEntries = getNightscoutFoodEntries;
exports.getNightscoutGlucoseEntries = getNightscoutGlucoseEntries;
exports.getNightscoutInsulinEntries = getNightscoutInsulinEntries;
exports.getNightscoutAllEntries = getNightscoutAllEntries;
