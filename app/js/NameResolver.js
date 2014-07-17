/******************************************************************************* 
* Copyright 2012, 2013 CNES - CENTRE NATIONAL d'ETUDES SPATIALES 
* 
* This file is part of SITools2. 
* 
* SITools2 is free software: you can redistribute it and/or modify 
* it under the terms of the GNU General Public License as published by 
* the Free Software Foundation, either version 3 of the License, or 
* (at your option) any later version. 
* 
* SITools2 is distributed in the hope that it will be useful, 
* but WITHOUT ANY WARRANTY; without even the implied warranty of 
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the 
* GNU General Public License for more details. 
* 
* You should have received a copy of the GNU General Public License 
* along with SITools2. If not, see <http://www.gnu.org/licenses/>. 
******************************************************************************/ 

/**
 * Name resolver module : search object name and zoom to it
 */
define(["jquery", "gw/FeatureStyle", "gw/VectorLayer", "gw/HEALPixBase", "gw/CoordinateSystem", "./Utils", "jquery.ui"],
	function($, FeatureStyle, VectorLayer, HEALPixBase, CoordinateSystem, Utils) {

// Name resolver globals
var sky;
var astroNavigator;
var configuration = {zoomFov: 15.};

// Target layer
var style = new FeatureStyle({
	iconUrl: "css/images/target.png",
	fillColor: [1., 1., 1., 1.]
 });
var targetLayer = new VectorLayer({ style: style });
// Zooming destination feature
var targetFeature;

/**************************************************************************************************************/

/**
 *	Update targetFeature and add it to the target layer
 *
 *	@param lon Destination longitude/right ascension in degrees
 *	@param lat Destination latitude/declination in degrees
 */
function addTarget(lon, lat)
{
	targetFeature = {
		"geometry": {
			"coordinates": [
				lon,
				lat
			],
			"type": "Point"
		},
		"type": "Feature"
	};

	targetLayer.addFeature( targetFeature );
}

/**************************************************************************************************************/

/**
 *	Search for object name
 *	Object name could be:
 *		* Degree in "HMS DMS" or "deg deg"
 *		* Object name as "Mars", "m31", "Mizar"
 *		* For debug : healpix(order, pixelIndex)
 */
function search(objectName, onSuccess, onError, onComplete)
{
	// regexp used only to distinct equatorial coordinates and objects
	// TODO more accurate ( "x < 24h", "x < 60mn", etc.. )

	objectName = objectName.replace(/\s{2,}/g, ' '); // Replace multiple spaces by a single one
	var coordinatesExp = new RegExp("\\d{1,2}[h|:]\\d{1,2}[m|:]\\d{1,2}([\\.]\\d+)?s?\\s[-+]?[\\d]+[°|:]\\d{1,2}['|:]\\d{1,2}([\\.]\\d+)?\"?", "g");
	var healpixRE = /^healpix\((\d)+,(\d+)\)/;
	var degRE = /^(\d+(\.\d+)?),?\s(-?\d+(\.\d+)?)/;
	var matchHealpix = healpixRE.exec(objectName);
	var matchDegree = degRE.exec(objectName);
	if ( matchHealpix ) 
	{
		var order = parseInt(matchHealpix[1]);
		var pixelIndex = parseInt(matchHealpix[2]);
		
		// Compute vertices
		var nside = Math.pow(2, order);
		var pix=pixelIndex&(nside*nside-1);
		var ix = HEALPixBase.compress_bits(pix);
		var iy = HEALPixBase.compress_bits(pix>>>1);
		var face = (pixelIndex>>>(2*order));

		var i = 0.5;
		var j = 0.5;
		var vert = HEALPixBase.fxyf( (ix+i)/nside, (iy+j)/nside, face);
		var geoPos = [];
		CoordinateSystem.from3DToGeo(vert, geoPos);
		zoomTo(geoPos[0],geoPos[1]);
	}
	else if ( objectName.match( coordinatesExp ) )
	{
		// Format to equatorial coordinates
		var word = objectName.split(" "); // [RA, Dec]

		word[0] = word[0].replace(/h|m|:/g," ");
		word[0] = word[0].replace("s", "");
		word[1] = word[1].replace(/°|'|:/g," ");
		word[1] = word[1].replace("\"", "");
		
		// Convert to geo and zoom
		var geoPos = [];
		CoordinateSystem.fromEquatorialToGeo([word[0], word[1]], geoPos);

		if ( CoordinateSystem.type != "EQ" )
		{
			geoPos = CoordinateSystem.convert(geoPos, CoordinateSystem.type, 'EQ');
		}

		zoomTo(geoPos[0], geoPos[1]);
	}
	else if ( matchDegree ) {
		var lon = parseFloat(matchDegree[1]);
		var lat = parseFloat(matchDegree[3]);
		var geo = [lon, lat];

		if ( CoordinateSystem.type != "EQ" )
		{
			geo = CoordinateSystem.convert(geo, CoordinateSystem.type,  'EQ');
		}

		zoomTo(geo[0], geo[1]);
	}
	else
	{
		// Name of the object which could be potentially found by name resolver
		var url = configuration.baseUrl + "/" + objectName + "/EQUATORIAL";

		$.ajax({
			type: "GET",
			url: url,
			success: function(response){
				// Check if response contains features
				if(response.type == "FeatureCollection")
				{
					var firstFeature = response.features[0];
					zoomTo(firstFeature.geometry.coordinates[0], firstFeature.geometry.coordinates[1]);

					if ( onSuccess )
						onSuccess(response);
				} else {
					onError();
				}
			},
			error: function (xhr, ajaxOptions, thrownError) {
				if( onError )
					onError();
				console.error( xhr.responseText );
			},
			complete: function(xhr)
			{
				if ( onComplete )
					onComplete(xhr);
			}
		});
	}
}

/**************************************************************************************************************/

/**
 *	Zoom to the given longitude/latitude and add target at the end
 */
function zoomTo(lon, lat)
{
	astroNavigator.zoomTo([lon, lat], configuration.zoomFov, 3000, function() {
		addTarget(lon,lat);
	} );
}

/**************************************************************************************************************/

/**
 *	Delete target image
 */
function removeTarget()
{
	if ( targetFeature )
	{
		targetLayer.removeFeature( targetFeature );
		targetFeature = null;
	}
}

/**************************************************************************************************************/

return {
	init: function(mizar, conf) {
		if ( !sky ) {
			sky = mizar.sky;
			astroNavigator = mizar.navigation;

			for( var x in conf.nameResolver )
			{
				configuration[x] = conf.nameResolver[x];
			}

			sky.addLayer( targetLayer );
			astroNavigator.subscribe("modified", removeTarget);
		} else {
			console.error("Name resolver is already initialized");
		}
	},

	/**
	 *	Unregister all event handlers
	 */
	remove: function() {
		if ( sky )
		{
			sky.removeLayer( targetLayer );
			astroNavigator.unsubscribe("modified", removeTarget);
			sky = null;
		}
	},

	goTo: search,
	zoomTo: zoomTo
};

});
