'use strict';

const STATUSES = ['Pending', 'In Progress', 'Completed'];
const MAX_MONEY = 1e12;

const isBlank = (v) => v === undefined || v === null || v === '';

function readText(body, key, label, { required = false, max = 120 } = {}, errors) {
  const raw = body[key];
  if (isBlank(raw)) {
    if (required) errors[key] = `${label} is required.`;
    return '';
  }
  if (typeof raw !== 'string') {
    errors[key] = `${label} must be text.`;
    return '';
  }
  const value = raw.trim();
  if (required && !value) errors[key] = `${label} is required.`;
  else if (value.length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
  return value;
}

function readMoney(body, key, label, errors) {
  const raw = body[key];
  if (isBlank(raw)) return 0;
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    errors[key] = `${label} must be a number.`;
    return 0;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) errors[key] = `${label} must be a number.`;
  else if (n < 0) errors[key] = `${label} cannot be negative.`;
  else if (n > MAX_MONEY) errors[key] = `${label} is too large.`;
  else return Math.round(n * 100) / 100;
  return 0;
}

function validateStatus(raw, errors, fallback = 'Pending') {
  if (isBlank(raw)) return fallback;
  if (!STATUSES.includes(raw)) {
    errors.status = `Status must be one of: ${STATUSES.join(', ')}.`;
    return fallback;
  }
  return raw;
}

/** Validates a full project payload (used by POST and PUT). */
function validateProject(body, { defaultStatus = 'Pending' } = {}) {
  const errors = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = {
    customer_name: readText(src, 'customer_name', 'Customer name', { required: true }, errors),
    work_description: readText(src, 'work_description', 'Work description', { required: true, max: 300 }, errors),
    project_cost: readMoney(src, 'project_cost', 'Project cost', errors),
    work_completed_by: readText(src, 'work_completed_by', 'Work completed by', {}, errors),
    investor_name: readText(src, 'investor_name', 'Investor name', {}, errors),
    investment_amount: readMoney(src, 'investment_amount', 'Investment amount', errors),
    status: validateStatus(src.status, errors, defaultStatus),
  };
  return { value, errors };
}

module.exports = { STATUSES, validateProject, validateStatus };
