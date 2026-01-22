/////////////////////////////////////////////////////////////
// AIM:
// This code computes some indices 
// There are two cloud masks (there are more in practice)
// and you can select which one to use.
// This cloud mask can be adapted/changed too.
// We need to still merge this 
// NDVI:  Normalised Difference Vegetation Index
// NDBI:  Normalised Difference Building Index
// MNDWI: Modified Normalised Difference Water Index
// NDBAI: Normalised Difference Bareness Index

// The computation of the indices is based on
// (many others):
// H. M. Imran et al.
// Impact of Land Cover Changes on Land Surface Temperature
// and Human Thermal Comfort in Dhaka City of Bangladesh,
// Earth Systems and Environment
// https://doi.org/10.1007/s41748-021-00243-4
// However, we have done some changes
//////////////////////////////////////////////////////////////
// 1. AREA OF INTEREST 
//////////////////////////////////////////////////////////////
// The variable "bangalore" is imported through uploading a shape file
// through the assets first. Please see here: 
// https://developers.google.com/earth-engine/guides/table_upload
// The geojson is obtained from:
// https://data.opencity.in/dataset/bbmp-ward-information
// It was converted to a shape file before uploading it to Earth Engine using GDAL
// using the following script: 
// https://github.com/EllenB/lstroad/blob/main/notebooks/01_data_clean_bengalure_a.ipynb

print('Bangalore', bangalore);
print('The number of wards in Bangalore');
print(bangalore.size());
var bangGeometry = bangalore.union(50);
Map.centerObject(bangGeometry);

// Visualisation - Outline only of Bangalore
var empty = ee.Image().byte();
var bangaloreOutline = empty.paint({
    featureCollection: bangGeometry,
    color: 1,
    width: 2
});

// Display Bangalore boundary in red.
Map.addLayer(bangaloreOutline,{palette: '#FF0000'},'Bangalore boundary');

// Display the wards
var wardsOutline = empty.paint({
  featureCollection: bangalore,
  color: 1,
  width: 2
});
Map.addLayer(wardsOutline, {palette: '#0000FF'}, 'Bangalore Wards');

// Add also the wards map itself as you can use that with
// the inspector tool
Map.addLayer(bangalore, {}, 'bangalore wards');

///////////////////////////////////////////////////////////////////////
// 2. IMPORT THE COLLECTION
///////////////////////////////////////////////////////////////////////
var colThsummer = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') 
.filterBounds(bangGeometry) 
.filterDate('2024-01-01', '2025-11-01') 
.filter(ee.Filter.calendarRange(3, 5, 'month'));

print('Landsat 8 summer collection', colThsummer);

//////////////////////////////////////////////////////////////
// 3. CLOUD MASKING AND RESCALING
//////////////////////////////////////////////////////////////
function cloud_rescale(image) {
//   var qaMask = image.select('QA_PIXEL')
  // This is the cloud mask from Ermida:
  // https://github.com/sofiaermida/Landsat_SMW_LST/
  // blob/master/modules/cloudmask.js
  // Uncomment if you want to use this mask
  // E.g. if you use the Ermida LST computations
  // As cloud masks have to match
  // var qa = image.select('QA_PIXEL');
  // var qamask = qa.bitwiseAnd(1 << 3).or(qa.bitwiseAnd(1 << 4));
  
  // This is the cloud mask we have been using:
  // Code obtained from:
  // https://courses.spatialthoughts.com/end-to-end-gee-supplement.html#derive-lst-from-landsat-images 
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);
    
  // scaling
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);
  
  return image.addBands(opticalBands, null, true)
      .addBands(thermalBands, null, true)
      .updateMask(qaMask)
      .updateMask(saturationMask);
}

colThsummer = colThsummer.map(cloud_rescale);   

////////////////////////////////////////////////////////////////////
// 2. COMPUTING THE INDICES
////////////////////////////////////////////////////////////////////
function addIndices(image) {

  var ndvi = image.normalizedDifference(['SR_B5','SR_B4']).rename('NDVI');
  var ndbi = image.normalizedDifference(['SR_B6','SR_B5']).rename('NDBI');
  var mndwi = image.normalizedDifference(['SR_B3','SR_B6']).rename('MNDWI');
  var bsi = image.expression(
  '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))',
  {
    SWIR: image.select('SR_B6'),
    RED:  image.select('SR_B4'),
    NIR:  image.select('SR_B5'),
    BLUE: image.select('SR_B2')
  }
).rename('BSI');
  
  return image.addBands([ndvi, ndbi, mndwi, bsi]);
}  
    
var indices = colThsummer.map(addIndices);  
print('indices collection', indices);

// Median indices
// Take median of the indices across all images
var medianIndices = indices
  .select(['NDVI','NDBI','MNDWI', 'BSI'])
  .median()
  .clip(bangGeometry);

print('Median indices:', medianIndices);
//////////////////////////////////////////////////////////////////////
// 3. VISUALISATION OF THE INDICES
//////////////////////////////////////////////////////////////////////
// NDVI
var ndviVis = {
  min: 0,
  max: 1,
  palette: ['red','yellow','green']  
};

// Add to map
Map.addLayer(medianIndices.select('NDVI'), ndviVis, 'Median NDVI');

// NDBI visualization
var ndbiVis = {min:-0.5, max:0.5, palette:['white','red']};
Map.addLayer(medianIndices.select('NDBI'), ndbiVis, 'Median NDBI');

var mndwiVis = {min:0, max:0.5, palette:['white','blue']};
Map.addLayer(medianIndices.select('MNDWI'), mndwiVis, 'Median MNDWI');

// // BSI visualization
var bsiVis = {min:-0.2, max:0.3, palette:['green','yellow','red']};
Map.addLayer(medianIndices.select('BSI'), bsiVis, 'Median BSI');
///////////////////////////////////////////////////////////////////////
// 4. ZONAL STATISTICS
///////////////////////////////////////////////////////////////////////
print('medianIndices', medianIndices);

var indiceswards = medianIndices.reduceRegions({
    collection: bangalore,
    reducer: ee.Reducer.mean(),
    scale: 30,
});
// // You can export the table and open in Excel or other and sort
// // Get a table of data out of Google Earth Engine.
// // In this code, water is not masked
Export.table.toDrive({
    collection: indiceswards,
    description: 'indices_bang'
});
print('Indices per ward', indiceswards); 

// /////////////////////////////////////////////////
// // 5. VISUALISATION 
// ////////////////////////////////////////////////
// //////////////////////////////////////////////////////
// // Visualisation using chloropeth map
// /////////////////////////////////////////////////////
// This code is based on:
// // U. Gandhi,, "Chapter F5.3: Advanced Vector Operations" 
// in Cloud-Based Remote Sensing with Google Earth Engine, 
// J. A. Cardille, M. A. Crowley, D. Saah and N. E. Clinton, SpringerOpen Online, 
// Accessed: August, 11, 2023 [Online]. Available:. https://www.eefabook.org/
print(indiceswards.first());

Map.addLayer(
  ee.Image().float().paint({
    featureCollection: indiceswards,
    color: 'NDVI'
  }),
  {min: 0, max: 0.5, palette: ['red','yellow','green']},
  'Mean NDVI per ward'
);
Map.addLayer(
  ee.Image().byte().paint({
    featureCollection: bangalore,  // original ward polygons
    color: 1,
    width: 2
  }),
  {palette: '#0000FF'},           // outline color
  'Ward boundaries'
);

// var palette = ['red','yellow','green'];
// var visParams = {
//   min: 0,
//   max: 0.5,
//   palette: palette
// };

// // Create the legend panel
// var legend = ui.Panel({
//   style: {
//     position: 'bottom-right',
//     padding: '8px 15px'
//   }
// });

// // Title
// var legendTitle = ui.Label({
//   value: 'NDVI',
//   style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0', padding: '0'}
// });
// legend.add(legendTitle);

// // Max label (on top)
// legend.add(ui.Label(visParams.max));

// // Create gradient image
// var lon = ee.Image.pixelLonLat().select('latitude');
// var gradient = lon.multiply((visParams.max - visParams.min)/100.0).add(visParams.min);
// var legendImage = gradient.visualize(visParams);

// // Thumbnail (vertical gradient)
// var thumbnail = ui.Thumbnail({
//   image: legendImage,
//   params: {bbox: '0,0,10,100', dimensions:'10x200'},
//   style: {padding: '1px', position: 'bottom-center'}
// });
// legend.add(thumbnail);

// // Min label (at bottom)
// legend.add(ui.Label(visParams.min));

// // Add the legend to the map
// Map.add(legend);

// NDBI

Map.addLayer(
  ee.Image().float().paint({
    featureCollection: indiceswards,
    color: 'NDBI'
  }),
  {min: -0.1, max: 0.1, palette: ['white', 'red']},
  'Mean NDBI per ward'
);
Map.addLayer(
  ee.Image().byte().paint({
    featureCollection: bangalore,  // original ward polygons
    color: 1,
    width: 2
  }),
  {palette: '#0000FF'},           // outline color
  'Ward boundaries'
);

// var palette = ['white', 'red'];
// var visParams = {
//   min: -0.1,
//   max: 0.1,
//   palette: palette
// };

// // Create the legend panel
// var legend = ui.Panel({
//   style: {
//     position: 'bottom-right',
//     padding: '8px 15px'
//   }
// });

// // Title
// var legendTitle = ui.Label({
//   value: 'NDBI',
//   style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0', padding: '0'}
// });
// legend.add(legendTitle);

// // Max label (on top)
// legend.add(ui.Label(visParams.max));

// // Create gradient image
// var lon = ee.Image.pixelLonLat().select('latitude');
// var gradient = lon.multiply((visParams.max - visParams.min)/100.0).add(visParams.min);
// var legendImage = gradient.visualize(visParams);

// // Thumbnail (vertical gradient)
// var thumbnail = ui.Thumbnail({
//   image: legendImage,
//   params: {bbox: '0,0,10,100', dimensions:'10x200'},
//   style: {padding: '1px', position: 'bottom-center'}
// });
// legend.add(thumbnail);

// // Min label (at bottom)
// legend.add(ui.Label(visParams.min));

// // Add the legend to the map
// Map.add(legend);

// MNDWI

Map.addLayer(
  ee.Image().float().paint({
    featureCollection: indiceswards,
    color: 'MNDWI'
  }),
  {min: -0.4, max: -0.1, palette: ['white', 'blue']},
  'Mean MNDWI per ward'
);
Map.addLayer(
  ee.Image().byte().paint({
    featureCollection: bangalore,  // original ward polygons
    color: 1,
    width: 2
  }),
  {palette: '#0000FF'},           // outline color
  'Ward boundaries'
);

var palette = ['white', 'blue'];
var visParams = {
  min: -0.4,
  max: -0.1,
  palette: palette
};

// // Create the legend panel
// var legend = ui.Panel({
//   style: {
//     position: 'bottom-right',
//     padding: '8px 15px'
//   }
// });

// // Title
// var legendTitle = ui.Label({
//   value: 'MNDWI',
//   style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0', padding: '0'}
// });
// legend.add(legendTitle);

// // Max label (on top)
// legend.add(ui.Label(visParams.max));

// // Create gradient image
// var lon = ee.Image.pixelLonLat().select('latitude');
// var gradient = lon.multiply((visParams.max - visParams.min)/100.0).add(visParams.min);
// var legendImage = gradient.visualize(visParams);

// // Thumbnail (vertical gradient)
// var thumbnail = ui.Thumbnail({
//   image: legendImage,
//   params: {bbox: '0,0,10,100', dimensions:'10x200'},
//   style: {padding: '1px', position: 'bottom-center'}
// });
// legend.add(thumbnail);

// // Min label (at bottom)
// legend.add(ui.Label(visParams.min));

// // Add the legend to the map
// Map.add(legend);

// BSI

Map.addLayer(
  ee.Image().float().paint({
    featureCollection: indiceswards,
    color: 'BSI'
  }),
  {min: -0.35, max: 0.13, palette: ['white', 'brown']},
  'Mean BSI per ward'
);
Map.addLayer(
  ee.Image().byte().paint({
    featureCollection: bangalore,  // original ward polygons
    color: 1,
    width: 2
  }),
  {palette: '#0000FF'},           // outline color
  'Ward boundaries'
);

var palette = ['white', 'brown'];
var visParams = {
  min: -0.35,
  max: -0.13,
  palette: palette
};

// Create the legend panel
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px'
  }
});

// Title
var legendTitle = ui.Label({
  value: 'BSI',
  style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0', padding: '0'}
});
legend.add(legendTitle);

// Max label (on top)
legend.add(ui.Label(visParams.max));

// Create gradient image
var lon = ee.Image.pixelLonLat().select('latitude');
var gradient = lon.multiply((visParams.max - visParams.min)/100.0).add(visParams.min);
var legendImage = gradient.visualize(visParams);

// Thumbnail (vertical gradient)
var thumbnail = ui.Thumbnail({
  image: legendImage,
  params: {bbox: '0,0,10,100', dimensions:'10x200'},
  style: {padding: '1px', position: 'bottom-center'}
});
legend.add(thumbnail);

// Min label (at bottom)
legend.add(ui.Label(visParams.min));

// Add the legend to the map
Map.add(legend);

