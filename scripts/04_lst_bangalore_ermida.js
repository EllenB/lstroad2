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
// 2: COMPUTE THE LST
//////////////////////////////////////////////////////////////////////
// This code uses the code of the following authors to compute the LST:
// S.L. Ermida, P. Soares, V. Mantas, F.-M..Göttsche and I.F. Trigo,  
// Google Earth Engine open-source code for Land Surface Temperature estimation from the Landsat series.
// Remote Sensing, 12 (9), pp. 1471, 2020, https://doi.org/10.3390/rs12091471

// Link to the module of Ermida et al. that computes the Landsat LST.
var landsatLST = require('users/sofiaermida/landsat_smw_lst:modules/Landsat_LST.js')


// Set some parameters
var geometry = bangGeometry;
var satellite = 'L8';
var dateStart = '2024-01-01';
var dateEnd = '2025-11-01';
var useNdvi = true;
// Get the Landsat collection
var landsatColl = landsatLST.collection(satellite, dateStart, dateEnd,
    geometry, useNdvi);
print('LST collection ',landsatColl);

// Get only the summer months
// Filter to summer months (March, April, May)
var summerLST = landsatColl.filter(
  ee.Filter.calendarRange(3, 5, 'month')
);

// Compute median Image from the collection
var summerLSTmedian = summerLST.select('LST').median();

// Convert from Kelvin to Celsius
var lst = summerLSTmedian.subtract(273.15);

print(lst);

// Code from Ujaval Gandhi:
// https://courses.spatialthoughts.com/end-to-end-gee-supplement.html#derive-lst-from-landsat-images
Map.addLayer(lst.clip(geometry), 
  {min:25, max:45, palette:['green','yellow','red']}, 
  'Landsat-LST (Ermida et al. algorithm)');

/////////////////////////////////////////  
// 3. ZONAL STATISTICS
/////////////////////////////////////////
var LSTwards = lst.reduceRegions({
    collection: bangalore,
    reducer: ee.Reducer.mean(),
    scale: 30,
});
// You can export the table and open in Excel or other and sort
// Get a table of data out of Google Earth Engine.
// In this code, water is not masked
Export.table.toDrive({
    collection: LSTwards,
    description: 'lstermidasummer_bang'
});
print('LST per ward', LSTwards); 

/////////////////////////////////////////////////
// 4. VISUALISATION
////////////////////////////////////////////////
//////////////////////////////////////////////////////
// Visualisation using chloropeth map
/////////////////////////////////////////////////////
// This code is based on:
// // U. Gandhi,, "Chapter F5.3: Advanced Vector Operations" 
// in Cloud-Based Remote Sensing with Google Earth Engine, 
// J. A. Cardille, M. A. Crowley, D. Saah and N. E. Clinton, SpringerOpen Online, 
// Accessed: August, 11, 2023 [Online]. Available:. https://www.eefabook.org/
var stats = LSTwards.aggregate_stats('mean');
print(stats);
var empty = ee.Image().float();
var bangBlocksPaint = empty.paint({
featureCollection: LSTwards,
    color: 'mean',
});

var palette = ['#066af4','#3ca832','#FFFF00', '#ED7014', '#ff0000'];
var visParams = {
    min: 35,
    max: 42,
    palette: palette
};
Map.addLayer(bangBlocksPaint.clip(bangGeometry), visParams,
    'LST means per ward');

// Add a legend
// Code obtained from:
// https://mygeoblog.com/2017/03/02/creating-a-gradient-legend/
// set position of panel
var legend11 = ui.Panel({
style: {
position: 'bottom-right',
padding: '8px 15px'
}
});
// Create legend title
var legendTitle = ui.Label({
value: 'LST (°C)',
style: {
fontWeight: 'bold',
fontSize: '18px',
margin: '0 0 4px 0',
padding: '0'
}
});

// Add the title to the panel
legend11.add(legendTitle);

// create the legend image
var lon = ee.Image.pixelLonLat().select('latitude');
var gradient = lon.multiply((visParams.max-visParams.min)/100.0).add(visParams.min);
var legendImage = gradient.visualize(visParams);

// create text on top of legend
var panel = ui.Panel({
widgets: [
ui.Label(visParams['max'])
],
});

legend11.add(panel);

// create thumbnail from the image
var thumbnail = ui.Thumbnail({
image: legendImage,
params: {bbox:'0,0,10,100', dimensions:'10x200'},
style: {padding: '1px', position: 'bottom-center'}
});
 
// add the thumbnail to the legend
legend11.add(thumbnail);

Map.add(legend11);

// create text on top of legend
var panel = ui.Panel({
widgets: [
ui.Label(visParams['min'])
],
});
 
legend11.add(panel);

Map.addLayer(wardsOutline, {palette: '#0000FF'}, 'Bangalore Wards');


 