import * as d3scale from 'd3-scale';
import * as d3selection from 'd3-selection';
import * as d3array from 'd3-array';
import * as d3axis from 'd3-axis';
import d3Tip from "d3-tip";
const d3 = Object.assign({}, d3selection, d3scale, d3array, d3axis);
d3.tip = d3Tip;

import jQuery from 'jQuery';
import 'tree-multiselect';
import 'tree-multiselect/dist/jquery.tree-multiselect.css'

import DATA from './data.csv';

import './style.css';

const COLORS = ['#2a80b9', '#8f44ad', '#c1392b', '#f39c11', '#27ae61', '#2d3e50'];
function prop(name) {
  return (obj) => obj[name];
}

const BAR_HEIGHT = 20;
const INNER_PADDING = 5;
let svg = d3.select("svg"),
    margin = {top: 40, right: 20, bottom: 40, left: 0},
    width = +svg.attr("width") - margin.left - margin.right;

let container = svg.append("g")
                   .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

let NUMERIC_PROPS = ['weight', 'lower', 'upper', 'range',
                     'usable_lower', 'usable_upper'];

let CONFIG = {
  sortOn: 'model',
  expansion: 'max',
  filter: null,
  filterItems: null,
  color: 'model',
  units: 'metric',
  scale: 'linear',
  weights: 'hide'
};

let toolTip = null;
window.closeToolTip = function() {
  if (toolTip) {
    toolTip.hide();
  }
};

function getFullName(d) {
  return d.brand + d.model;
}

function bindById(id, evt, handler) {
  document.getElementById(id).addEventListener(evt, handler);
}

function toggleFilter() {
  document.getElementById('control-filter-container').classList.toggle('hidden');
}

const CONTROL_TO_CONFIG = {
  'sort-by': 'sortOn',
  'expansion': 'expansion',
  'control-color': 'color',
  'control-units': 'units',
  'control-scale': 'scale',
  'control-weights': 'weights'
};

function bindEventHandlers() {
  for (let controlId in CONTROL_TO_CONFIG) {
    bindById(controlId, 'change', (function(configKey) {
      return function(event) {
        CONFIG[configKey] = event.target.value;
        rerender();
      };
    })(CONTROL_TO_CONFIG[controlId]));
  }
  bindById('control-filter-open', 'click', function(e) {
    toggleFilter();
  });
  bindById('control-filter-apply', 'click', function(e) {
    toggleFilter();
    let opts = document.getElementById('control-filter-select').selectedOptions;
    let values = [];
    for (let i = 0; i < opts.length; i++) {
      values.push(Number(opts.item(i).value));
    }
    CONFIG.filterItems = values;
    rerender();
  });
  bindById('control-share', 'click', function(e) {
    window.location.hash = serializeConfig();
    e.preventDefault();
    document.getElementById('share-info-url').value = window.location.toString();
    document.getElementById('share-info').classList.toggle('hidden');
    document.getElementById('share-info-url').select();
  })
  bindById('share-info-close', 'click', function(e) {
    document.getElementById('share-info').classList.toggle('hidden');
  })
  // click handler to close the tooltip
  document.addEventListener('click', function(e) {
    if (!toolTip) {
      return;
    }
    let element = e.srcElement;
    while (element) {
      // ignore any clicks in the header
      // ignore clicks from inside the tooltip
      if (element.tagName === 'HEADER' || element.classList.contains('d3-tip')) {
        return;
      }
      element = element.parentElement;
    }

    toolTip.hide();
  });
}

/**
 * One time setup for the controls. Sets up the filter element and
 * sets selectors to match the config.
 */
function initControls() {
  setupFilters();
}

/**
 * One time setup for the filter element
 */
function setupFilters() {
  let selected = CONFIG.filterItems || [];
  let selectedMap = {};
  for (let i = 0; i < selected.length; i++) {
    selectedMap[selected[i]] = true;
  }
  let select = document.getElementById('control-filter-select');
  for (let i = 0; i < DATA.length; i++) {
    let row = DATA[i];
    let opt = document.createElement('option');
    opt.setAttribute('data-section', `${row.brand}/${row.model}`);
    opt.setAttribute('value', i);
    if (selectedMap[i]) {
      opt.setAttribute('selected', '');
    }
    opt.textContent = `${row.size}`;
    select.appendChild(opt);
  }

  let opts = { searchable: true, hideSidePanel: true, startCollapsed: true };
  jQuery(select).treeMultiselect(opts);
}

function loadData(cb) {
  for (let d of DATA) {
    for (let prop of NUMERIC_PROPS) {
      d[prop] = +d[prop];
    }
  }
  cb();
}

/**
 * all the config keys that can be saved / loaded
 */
const SERIALIZABLE_CONFIG_KEYS = ['sortOn', 'expansion', 'color', 'units', 'scale', 'weights'];

/**
 * A string representation of all the user's filtered (selected) items and other config items.
 * Should be stable (so the string will be the same even if DATA gets more items).
 */
function serializeConfig() {
  let items = CONFIG.filterItems;
  let configItems = [];
  if (items && items.length) {
    configItems.push('items=' + CONFIG.filterItems.map((i) => DATA[i].id).join(','));
  }
  for (let i = 0; i < SERIALIZABLE_CONFIG_KEYS.length; i++) {
    let key = SERIALIZABLE_CONFIG_KEYS[i];
    let val = CONFIG[key]
    if (val) {
      configItems.push(key + '=' + val);
    }
  }
  return configItems.join('&');
}

/**
 * Set the filter items from a string.
 * @param {*} serialized should be derived from `serializeConfig()`
 */
function setConfigFromString(serialized) {
  if (!serialized) {
    return;
  }

  let parts = serialized.split('&');
  for (let i = 0; i < parts.length; i++) {
    let kv = parts[i].split('=', 2);
    let key = kv[0];
    let value = kv[1];
    if (key === 'items') {
      let itemIds = {};
      let itemIdArray = value.split(',');
      for (let i = 0; i < itemIdArray.length; i++) {
        let id = itemIdArray[i];
        itemIds[id] = true;
      }

      let items = [];
      for (let i = 0; i < DATA.length; i++) {
        if (itemIds[DATA[i].id]) {
          items.push(i);
        }
      }

      CONFIG.filterItems = items;
    } else if (SERIALIZABLE_CONFIG_KEYS.includes(key)) {
      CONFIG[key] = value;
    }
  }
}

function buildColorMap(data) {
  let modelNames = {};
  for (let row of data) {
    modelNames[getFullName(row)] = row.model;
  }
  let modelNameKeys = Object.keys(modelNames);
  modelNameKeys.sort();
  let colorMap = {};
  let i = 0;
  for (let key of modelNameKeys) {
    colorMap[modelNames[key]] = COLORS[i];
    i = (i + 1) % COLORS.length;
  }
  return colorMap;
}

function decimalAdjust(type, value, exp) {
  // If the exp is undefined or zero...
  if (typeof exp === 'undefined' || +exp === 0) {
    return Math[type](value);
  }
  value = +value;
  exp = +exp;
  // If the value is not a number or the exp is not an integer...
  if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
    return NaN;
  }
  // If the value is negative...
  if (value < 0) {
    return -decimalAdjust(type, -value, exp);
  }
  // Shift
  value = value.toString().split('e');
  value = Math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
  // Shift back
  value = value.toString().split('e');
  return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
}

function round(v, digits) {
  return decimalAdjust('round', v, digits);
}

function unitsMetric(mm) {
  return mm;
}

function unitsImperial(mm) {
  return 0.0393701 * mm;
}

function buildHeightAndYAxis(showWeights, data) {
  if (!showWeights) {
    let height = BAR_HEIGHT * data.length;
    return {
      height,
      y: d3.scaleBand().rangeRound([0, height]).paddingInner(0.1).domain(d3.range(data.length))
    };
  }

  let y = d3.scaleLinear().range([0, BAR_HEIGHT]).domain([0, d3.min(data, prop('weight'))]);
  return {
    height: d3.sum(data, (d) => y(d.weight)) + data.length * INNER_PADDING,
    y
  }
}

function rerender() {
  let data = filterData(DATA);
  sortData(data);

  if (CONFIG.filterItems && CONFIG.filterItems.length) {
    document.getElementById('control-filter-info').classList.remove('hidden');
  } else {
    document.getElementById('control-filter-info').classList.add('hidden');
  }

  if (toolTip && toolTip.hide) {
    toolTip.hide();
  }
  const units = CONFIG.units === 'metric' ? unitsMetric : unitsImperial;
  const unit = CONFIG.units === 'metric' ? 'mm' : 'in';

  const closeBtn = '<span class="hide-popover"><button onclick="closeToolTip()">X</button></span>';
  function renderNum(n) {
    return Math.round(units(n) * 100) / 100;
  }
  toolTip = d3
    .tip()
    .attr('class', 'd3-tip')
    .direction(function() {
      let x = Number(this.attributes.x.value);
      let widthAttr = this.attributes.width;
      let w = widthAttr ? Number(widthAttr.value) : 0;
      return x + w > 700 ? 'w' : 'e';
    })
    .offset(function() {
      return [39,0];
    })
    .html((d) => {
      let rows = [
        `${d.brand} ${d.model} ${d.size} (${d.color})`,
        `${d.lobes} lobes`,
        `${d.weight} g`,
        `${d.strength} kN`,
        `Max range: ${renderNum(d.lower)} - ${renderNum(d.upper)} ${unit}`,
        `Usable range: ${renderNum(d.usable_lower)} - ${renderNum(d.usable_upper)} ${unit}`
      ].map((row) => `<p>${row}</p>`);
      return rows.join('') + closeBtn;
    });

  let upperProp, lowerProp;
  if (CONFIG.expansion === 'max') {
    upperProp = 'upper';
    lowerProp = 'lower';
  } else {
    upperProp = 'usable_upper';
    lowerProp = 'usable_lower';
  }

  const showWeights = CONFIG.weights === 'show';
  let { y, height } = buildHeightAndYAxis(showWeights, data);
  let x = CONFIG.scale === 'linear' ? d3.scaleLinear() : d3.scaleLog().base(2).nice();
  x = x.rangeRound([0, width]);

  x.domain([ units(d3.min(data, prop(lowerProp))), units(d3.max(data, prop(upperProp))) ]);

  let frameHeight = height + margin.top + margin.bottom + 2 * INNER_PADDING;
  svg.attr('height', frameHeight + 'px');

  container.selectAll('g').remove();
  container.call(toolTip);
  document.getElementsByClassName('hide-popover');

  container
    .append("g")
    .attr("class", "axis x bottom")
    .attr("transform", "translate(0," + (height + 2 * INNER_PADDING) + ")")
    .call(d3.axisBottom(x).ticks(20))
    .append('text')
    .attr('class', 'label')
    .attr("y", "30px")
    .style("text-anchor", "start")
    .text(`Expansion (${unit})`);

  container
    .append("g")
    .attr("class", "axis x top")
    .call(d3.axisTop(x).ticks(20))
    .append('text')
    .attr('class', 'label')
    .attr("y", "-25px")
    .style("text-anchor", "start")
    .text(`Expansion (${unit})`);

  container
    .append("g")
    .attr('class', 'grid x')
    .call(d3.axisBottom(x).ticks(20).tickSize(height + 2 * INNER_PADDING).tickFormat(''));

  let bars = container
    .selectAll(".bar")
    .data(data)
    .enter()
    .append("g")
    .attr('class', 'bar');

  function barHeight(d) {
    if (showWeights) {
      return y(d.weight);
    } else {
      return y.bandwidth();
    }
  }
  let yLocs = [];
  if (showWeights) {
    let last = INNER_PADDING;
    for (let d of data) {
      yLocs.push(last);
      last += y(d.weight) + INNER_PADDING;
    }
  }
  function barY(i) {
    if (showWeights) {
      return yLocs[i]
    } else {
      return y(i);
    }
  }
  let barRects = bars
    .append('rect')
    .attr("x", (d) => x(units(d[lowerProp])))
    .attr("y", (d, i) => barY(i) + INNER_PADDING)
    .attr("width", (d) => x(units(d[upperProp])) - x(units(d[lowerProp])))
    .attr("height", barHeight)
    .on('mouseover', function(d) {
      toolTip.show.apply(this, [d, this]);
    });
  switch (CONFIG.color) {
    case 'model':
      let colorMap = buildColorMap(data);
      barRects.attr('fill', (d) => colorMap[d.model]);
      break;
    case 'cam':
      barRects.attr('fill', (d) => d.color);
      break;
    case 'none':
      break;
    default:
      throw new Error('unhandled coloring type: ' + CONFIG.color);
  }

  let getX = (d) => x(units(d[upperProp])) + 5 + 5;
  let flipOrientation = (d) => getX(d) > 750;
  let labels = bars
    .append('text')
    .attr('x', getX)
    .attr('y', (d, i) => barY(i) + BAR_HEIGHT + INNER_PADDING)
    .attr('dy', '-.35em')
    .attr('text-anchor', (d) => flipOrientation(d) ? 'end' : null)
    .attr('fill', (d) => flipOrientation(d) ? 'white' : null)
    .attr('dx', (d) => flipOrientation(d) ? '-1em' : null)
    .text((d) => `${d.brand} ${d.model} ${d.size}`)
    .on('mouseover', function(d) {
      let context = this.previousSibling;
      toolTip.show.apply(context, [d, context]);
    });
}

const SORT_FNS = {
  model: (d0, d1) => getFullName(d0).localeCompare(getFullName(d1)),
  size: (d0, d1) => d0.lower - d1.lower,
  weight: (d0, d1) => d0.weight - d1.weight
};
function combineSort(first, second) {
  return (d0, d1) => {
    let v = first(d0, d1);
    return v === 0 ? second(d0, d1) : v;
  }
}

function filterData(data) {
  if (CONFIG.filter) {
    let f = CONFIG.filter.toLowerCase().trim();
    return data.filter((d) =>
      d.model.toLowerCase().includes(f) || d.brand.toLowerCase().includes(f)
    );
  } else if (CONFIG.filterItems && CONFIG.filterItems.length) {
    let items = [];
    for (let i of CONFIG.filterItems) {
      items.push(data[i]);
    }
    return items;
  } else {
    return data.map((x) => x);
  }
}

function sortData(data) {
  let sortFn;
  switch (CONFIG.sortOn) {
    case 'model':
      sortFn = combineSort(SORT_FNS.model, SORT_FNS.size);
      break;
    case 'size':
      sortFn = SORT_FNS.size;
      break;
    case 'weight':
      sortFn = SORT_FNS.weight;
      break;
    default:
      throw new Error('unknown sort type: ' + CONFIG.sortOn);
  }
  data.sort(sortFn);
}

bindEventHandlers();
loadData(() => {
  let h = window.location.hash;
  if (h) {
    setConfigFromString(h.split('#', 2)[1]);
  }
  rerender();
  initControls();
});
