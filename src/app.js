import * as d3scale from 'd3-scale';
import * as d3selection from 'd3-selection';
import * as d3array from 'd3-array';
import * as d3axis from 'd3-axis';
import d3Tip from "d3-tip";
const d3 = Object.assign({}, d3selection, d3scale, d3array, d3axis);
d3.tip = d3Tip;

import jQuery from 'jQuery';
import 'tree-multiselect';

import DATA from './data.csv';

import './style.css';

const COLORS = ['#2a80b9', '#8f44ad', '#c1392b', '#f39c11', '#27ae61', '#2d3e50'];
function prop(name) {
  return (obj) => obj[name];
}

let barHeight = 20;
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
  units: 'metric'
};

let toolTip = null;
window.closeToolTip = function() {
  if (toolTip) {
    toolTip.hide();
  }
};

function bindById(id, evt, handler) {
  document.getElementById(id).addEventListener(evt, handler);
}

function toggleFilter() {
  document.getElementById('control-filter-container').classList.toggle('hidden');
}

function bindEventHandlers() {
  bindById('sort-by', 'change', function(e) {
    CONFIG.sortOn = e.target.value;
    rerender();
  });
  bindById('expansion', 'change', function(e) {
    CONFIG.expansion = e.target.value;
    rerender();
  });
  bindById('control-color', 'change', function(e) {
    CONFIG.color = e.target.value;
    rerender();
  });
  bindById('control-units', 'change', function(e) {
    CONFIG.units = e.target.value;
    rerender();
  });
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
}

function setupFilters() {
  let select = document.getElementById('control-filter-select');
  for (let i = 0; i < DATA.length; i++) {
    let row = DATA[i];
    let opt = document.createElement('option');
    opt.setAttribute('data-section', `${row.brand}/${row.model}`);
    opt.setAttribute('value', i);
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

function buildColorMap(data) {
  let models = {};
  for (let row of data) {
    models[row.model] = true;
  }
  models = Object.keys(models);
  models.sort();
  let colorMap = {};
  let i = 0;
  for (let model of models) {
    colorMap[model] = COLORS[i];
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

function rerender() {
  let data = filterData(DATA);
  sortData(data);
  let numRows = data.length;
  let height = barHeight * numRows;
  let innerPadding = 5;
  let frameHeight = height + margin.top + margin.bottom + 2 * innerPadding;
  svg.attr('height', frameHeight + 'px');

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

  let y = d3.scaleBand().rangeRound([0, height]).paddingInner(0.1),
      x = d3.scaleLinear().rangeRound([0, width]);
  let upperProp, lowerProp;
  if (CONFIG.expansion === 'max') {
    upperProp = 'upper';
    lowerProp = 'lower';
  } else {
    upperProp = 'usable_upper';
    lowerProp = 'usable_lower';
  }

  x.domain([ units(d3.min(data, prop(lowerProp))), units(d3.max(data, prop(upperProp))) ]);
  y.domain(d3.range(numRows));

  container.selectAll('g').remove();
  container.call(toolTip);
  document.getElementsByClassName('hide-popover');

  container
    .append("g")
    .attr("class", "axis x bottom")
    .attr("transform", "translate(0," + (height + 2 * innerPadding) + ")")
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
    .call(d3.axisBottom(x).ticks(20).tickSize(height + 2 * innerPadding).tickFormat(''));

  let bars = container
    .selectAll(".bar")
    .data(data)
    .enter()
    .append("g")
    .attr('class', 'bar');

  let barRects = bars
    .append('rect')
    .attr("x", (d) => x(units(d[lowerProp])))
    .attr("y", (d, i) => y(i) + innerPadding)
    .attr("width", (d) => x(units(d[upperProp])) - x(units(d[lowerProp])))
    .attr("height", y.bandwidth())
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
    .attr('y', (d, i) => y(i) + barHeight + innerPadding)
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
  model: (d0, d1) => d0.model == d1.model ? 0 : (d0.model < d1.model ? -1 : 1),
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
  rerender();
  setupFilters();
});
