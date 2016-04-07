/*******************************************************************************
 * Copyright 2012-2015 CNES - CENTRE NATIONAL d'ETUDES SPATIALES
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
/*global define: false */

/**
 * Mizar widget
 */
define(["jquery", "underscore-min",

        // Gui
        "./gui/LayerManagerView", "./gui/BackgroundLayersView",
        "./gui/NameResolverView", "./gui/ReverseNameResolverView",
        "./gui/PickingManager", "./gui/FeaturePopup",
        "./gui/IFrame", "./gui/Compass",
        "./gui/MollweideViewer", "./gui/ImageViewer",
        "./service/Share", "./service/Samp",
        "./gui/AdditionalLayersView", "./gui/ImageManager",

        // Gui
        "./gui/MeasureToolSky", "./gui/MeasureToolPlanet",
        "./gui/SwitchTo2D", "./gui/ExportTool",

        // Mizar_lite
        "../../mizar_lite/js/MizarWidgetGlobal",
        "../../mizar_lite/js/context/PlanetContext",
        "../../mizar_lite/js/context/SkyContext",
        "../../mizar_lite/js/layer/LayerManager",
        "../../mizar_lite/js/Utils",
        "../../mizar_lite/js/gui/ImageManagerLite",
        "../../mizar_lite/js/gui/AboutDialog",
        "../../mizar_lite/js/gui/ErrorDialog",

        // GlobWeb
        "gw/Utils/Event",

        // Externals
        "jquery.ui", "flot",
        "flot.tooltip", "flot.axislabels"],
    function ($, _,
              LayerManagerView, BackgroundLayersView,
              NameResolverView, ReverseNameResolverView,
              PickingManager, FeaturePopup,
              IFrame, Compass,
              MollweideViewer, ImageViewer,
              Share, Samp,
              AdditionalLayersView, ImageManager,
              MeasureToolSky, MeasureToolPlanet,
              SwitchTo2D, ExportTool,
              MizarWidgetGlobal, PlanetContext, SkyContext,
              LayerManager, Utils, ImageManagerLite, AboutDialog, ErrorDialog,
              Event) {

        /**
         *    Private variables
         */
        var parentElement;
        var options;
        var planetContext;
        var skyContext;
        var mizarCore;

        /**************************************************************************************************************/

        /**
         *    Mizar Widget GUI constructor
         */
        var MizarWidgetGui = function (div, globalOptions) {
            Event.prototype.constructor.call(this);

            this.mode = globalOptions.mode;

            parentElement = div;
            options = globalOptions.options;
            mizarCore = globalOptions.mizarGlobal.mizarWidgetCore;

            this.isMobile = globalOptions.isMobile;

            this.activatedContext = mizarCore.activatedContext;
            this.sky = this.activatedContext;

            this.navigation = this.sky.navigation;
            skyContext = this.sky;

            // TODO : Extend GlobWeb base layer to be able to publish events by itself
            // to avoid the following useless call
            var self = this;
            mizarGui = this;
            skyContext.globe.subscribe("features:added", function (featureData) {
                self.publish("features:added", featureData);
            });

            //self.subscribe('layer:fitsSupported', function (layerDesc, planetLayer) {
            //    self.addFitsEvent(layerDesc, planetLayer);
            //});

            // TODO : Extend GlobWeb base layer to be able to publish events by itself
            // to avoid the following useless call

            this.sky.globe.coordinateSystem.type = globalOptions.options.coordSystem;

            // Create data manager
            PickingManager.init(mizarCore, globalOptions.options);

            // Share configuration module init
            Share.init({
                mizar: mizarCore,
                navigation: this.navigation,
                configuration: globalOptions.options
            });

            // Initialize SAMP component
            // TODO : Bear in mind that a website may already implement specific SAMP logics, so check that
            // current samp component doesn't break existing SAMP functionality
            if (!this.isMobile) {
                var lm = mizarCore.getLayerManager();
                Samp.init(mizarCore, lm, ImageManagerLite, globalOptions.options);
            }

            // Initialization of tools useful for different modules
            Utils.init(mizarCore);

            // TODO Subscribe all events to MizarWidgetGlobal
            //MizarWidgetGlobal.subscribe('mizarGui:')

            /*** Refactor into common ? ***/
                // Fade hover styled image effect
            $("body").on("mouseenter", "span.defaultImg", function () {
                //stuff to do on mouseover
                $(this).stop().animate({"opacity": "0"}, 100);
                $(this).siblings('.hoverImg').stop().animate({"opacity": "1"}, 100);
            });
            $("body").on("mouseleave", "span.defaultImg", function () {
                //stuff to do on mouseleave
                $(this).stop().animate({"opacity": "1"}, 100);
                $(this).siblings('.hoverImg').stop().animate({"opacity": "0"}, 100);
            });

            // Close button event
            $('body').on("click", '.closeBtn', function () {
                switch ($(this).parent().attr("id")) {
                    case "externalIFrame":
                        IFrame.hide();
                        break;
                    case "selectedFeatureDiv":
                        FeaturePopup.hide();
                        break;
                    default:
                        $(this).parent().fadeOut(300);
                }
            });
        };

        /**************************************************************************************************************/

        Utils.inherits(Event, MizarWidgetGui);

        /**************************************************************************************************************/

        /**
         *    Add additional layer(OpenSearch, GeoJSON, HIPS, grid coordinates)
         *    @param layerDesc
         *        Layer description
         *    @param planetLayer
         *        Planet layer, if described layer must be added to planet (optional)
         *    @return
         *        The created layer
         */
        MizarWidgetGui.prototype.addFitsEvent = function (layerDesc, planetLayer) {

            // Add onready event if FITS supported by layer
            if (layerDesc.fitsSupported) {
                // TODO : Move it..
                layerDesc.onready = function (fitsLayer) {
                    if (fitsLayer.format === "fits" && fitsLayer.levelZeroImage) {
                        if (fitsLayer.div) {
                            // Additional layer
                            // Using name as identifier, because we must know it before attachment to globe
                            // .. but identfier is assigned after layer creation.
                            var shortName = Utils.formatId(fitsLayer.name);
                            $('#addFitsView_' + shortName).button("enable");
                            fitsLayer.div.setImage(fitsLayer.levelZeroImage);
                        }
                        else {
                            // Background fits layer
                            $('#fitsView').button("enable");
                            var backgroundDiv = BackgroundLayersView.getDiv();
                            backgroundDiv.setImage(fitsLayer.levelZeroImage);
                        }
                    }
                };
            }
        };

        /**************************************************************************************************************/

        /**
         *    Return current fov
         */
        MizarWidgetGui.prototype.getCurrentFov = function () {
            return this.navigation.getFov();
        };

        /**************************************************************************************************************/

        /**
         *    Set zoom(in other words fov)
         */
        MizarWidgetGui.prototype.setZoom = function (fovInDegrees, callback) {
            var geoPos = this.sky.coordinateSystem.from3DToGeo(this.navigation.center3d);
            this.navigation.zoomTo(geoPos, fovInDegrees, 1000, callback);
        };

        /**************************************************************************************************************/

        /**
         *    Set the credits popup
         */
        MizarWidgetGui.prototype.setShowCredits = function (visible) {
            skyContext.showCredits(visible);
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove compass GUI
         *    Only on desktop due performance issues
         */
        MizarWidgetGui.prototype.setCompassGui = function (visible) {
            if (!options.isMobile) {
                if (visible) {
                    this.compass = new Compass({
                        element: "compassDiv",
                        globe: this.sky.globe,
                        navigation: this.navigation,
                        coordSystem: this.sky.globe.coordinateSystem.type,
                        isMobile: options.isMobile,
                        mizarBaseUrl: options.mizarBaseUrl
                    });
                } else {
                    if (this.compass) {
                        this.compass.remove();
                    }
                }
                skyContext.setComponentVisibility("compassDiv", visible);
            }
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove angle distance GUI
         */
        MizarWidgetGui.prototype.setAngleDistanceSkyGui = function (visible) {
            if (visible) {
                // Distance measure tool lazy initialization
                if (this.mode == "sky") {
                    if (!this.measureToolSky) {
                        this.measureToolSky = new MeasureToolSky({
                            globe: this.sky.globe,
                            navigation: this.navigation,
                            isMobile: this.isMobile,
                            mode: this.mode
                        });
                    }
                }
            }
            skyContext.setComponentVisibility("measureSkyContainer", visible);
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove angle distance GUI
         */
        MizarWidgetGui.prototype.setAngleDistancePlanetGui = function (visible) {
            if (visible) {
                // Distance measure tool lazy initialization
                if (this.mode == "planet") {
                    if (!this.measureToolPlanet) {
                        this.measureToolPlanet = new MeasureToolPlanet({
                            globe: planetContext.globe,
                            navigation: planetContext.navigation,
                            planetLayer: planetContext.planetLayer,
                            isMobile: this.isMobile,
                            mode: this.mode
                        });
                    }
                }
            }
            skyContext.setComponentVisibility("measureSkyContainer", visible);
        };

        /**************************************************************************************************************/

        /**
         *    Activate Switch To 2D
         */
        MizarWidgetGui.prototype.setSwitchTo2D = function (visible) {
            if (visible) {

                if (!this.switchTo2D) {
                    this.switchTo2D = new SwitchTo2D({
                        mizar: this,
                        globe: this.sky.globe,
                        navigation: this.navigation,
                        isMobile: this.isMobile,
                        mode: this.mode
                    });
                }
            }
            skyContext.setComponentVisibility("measureContainer", visible);
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove samp GUI
         *    Only on desktop
         */
        MizarWidgetGui.prototype.setSampGui = function (visible) {
            if (!options.isMobile) {
                skyContext.setComponentVisibility("sampContainer", visible);
            }
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove shortener GUI
         */
        MizarWidgetGui.prototype.setShortenerUrlGui = function (visible) {
            skyContext.setComponentVisibility("shareContainer", visible);
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove 2d map GUI
         */
        MizarWidgetGui.prototype.setMollweideMapGui = function (visible) {
            if (visible) {
                // Mollweide viewer lazy initialization
                if (!this.mollweideViewer) {
                    this.mollweideViewer = new MollweideViewer({
                        globe: this.sky.globe,
                        navigation: this.navigation,
                        mizarBaseUrl: options.mizarBaseUrl
                    });
                }
            }
            skyContext.setComponentVisibility("2dMapContainer", visible);

        };

        /**************************************************************************************************************/

        /**
         *    Add/remove reverse name resolver GUI
         */
        MizarWidgetGui.prototype.setReverseNameResolverGui = function (visible) {
            if (visible) {
                ReverseNameResolverView.init(mizarCore, skyContext);
            } else {
                ReverseNameResolverView.remove();
            }
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove name resolver GUI
         */
        MizarWidgetGui.prototype.setNameResolverGui = function (visible) {
            if (visible) {
                NameResolverView.init(mizarCore);
            } else {
                NameResolverView.remove();
            }
            skyContext.setComponentVisibility("searchDiv", visible);
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove jQueryUI layer manager view
         */
        MizarWidgetGui.prototype.setCategoryGui = function (visible) {
            if (visible) {
                LayerManagerView.init(mizarCore, $.extend({element: $(parentElement).find("#categoryDiv")}, options));
            } else {
                LayerManagerView.remove();
            }
            skyContext.setComponentVisibility("categoryDiv", visible);
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove jQueryUI image viewer GUI
         */
        MizarWidgetGui.prototype.setImageViewerGui = function (visible) {
            if (!options.isMobile) {
                if (visible) {
                    ImageViewer.init(mizarCore);
                } else {
                    ImageViewer.remove();
                }
                skyContext.setComponentVisibility("imageViewerDiv", visible);
            }
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove jQueryUI Export GUI
         */
        MizarWidgetGui.prototype.setExportGui = function (visible) {
            if (visible) {
                this.exportTool = new ExportTool({
                    globe: this.sky.globe,
                    navigation: this.navigation,
                    layers: mizarCore.getLayers()
                });
            }

            skyContext.setComponentVisibility("exportContainer", visible);
        };

        /**************************************************************************************************************/

        /**
         *    Add/remove position tracker GUI
         */
        MizarWidgetGui.prototype.setPositionTrackerGui = function (visible) {
            skyContext.setComponentVisibility("posTracker", visible);
        };

        /**************************************************************************************************************/

        /**
         *    Set coordinate system
         *    @param newCoordSystem
         *        "EQ" or "GAL"(respectively equatorial or galactic)
         */
        MizarWidgetGui.prototype.setCoordinateSystem = function (newCoordSystem) {
            this.sky.coordinateSystem.type = newCoordSystem;

            if (this.mollweideViewer) {
                this.mollweideViewer.setCoordSystem(newCoordSystem);
            }

            // Publish modified event to update compass north
            this.navigation.publish('modified');
        };

        /**************************************************************************************************************/

        /**
         *    Get layer with the given name
         */
        MizarWidgetGui.prototype.getLayer = function (layerName) {
            var layers = mizarCore.getLayers();
            return _.findWhere(layers, {name: layerName});
        };

        /**************************************************************************************************************/

        /**
         *    Highlight the given feature
         *
         *    @param featureData
         *        Feature data is an object composed by feature and its layer
         *    @param options
         *        Focus feature options(isExclusive and color)
         *
         *    // TODO : maybe it's more intelligent to store layer reference on feature ?
         */
        MizarWidgetGui.prototype.highlightObservation = function (featureData, options) {
            PickingManager.focusFeature(featureData, options);
        };

        /**************************************************************************************************************/

        /**
         *    Add fits image to the given feature data
         */
        MizarWidgetGui.prototype.requestFits = function (featureData) {
            featureData.isFits = true; // TODO: Refactor it
            ImageManager.addImage(featureData);
        };

        /**************************************************************************************************************/

        /**
         *    Remove fits image to the given feature data
         */
        MizarWidgetGui.prototype.removeFits = function (featureData) {
            ImageManager.removeImage(featureData);
        };


        /**************************************************************************************************************/

        /**
         *    Toggle between planet/sky mode
         */
        MizarWidgetGui.prototype.toggleMode = function (gwLayer, planetDimension, callback) {
            var mizarCore = mizar.getMizarCore();
            var mizarGui = mizar.getMizarGui();

            mizarCore.mode = (mizarCore.mode === "sky") ? "planet" : "sky";

            if (mizarCore.mode === "sky") {
                console.log("Change planet to sky context");
                // Hide planet
                planetContext.hide();

                // desactive the planet measure tool
                if (!_.isEmpty(mizarGui.measureToolPlanet) && mizarGui.measureToolPlanet.activated)
                    mizarGui.measureToolPlanet.toggle();

                mizarCore.activatedContext = skyContext;
                // Add smooth animation from planet context to sky context
                planetContext.navigation.toViewMatrix(mizarCore.oldVM, mizarCore.oldFov, 2000, function () {
                    // Show all additional layers
                    skyContext.showAdditionalLayers();
                    mizarCore.sky.renderContext.tileErrorTreshold = 1.5;
                    mizarCore.publish("mizarMode:toggle", gwLayer);

                    // Destroy planet context
                    planetContext.destroy();
                    planetContext = null;
                    // Show sky
                    skyContext.show();
                    mizarCore.sky.refresh();
                    if (callback) {
                        callback.call(mizarCore);
                    }
                });

            } else {
                console.log("Change sky to planet context");

                // Hide sky
                skyContext.hide();

                // Hide all additional layers
                skyContext.hideAdditionalLayers();
                // Create planet context( with existing sky render context )
                var planetConfiguration = {
                    planetLayer: gwLayer,
                    renderContext: mizarCore.sky.renderContext,
                    initTarget: options.navigation.initTarget,
                    reverseNameResolver: {
                        "baseUrl": gwLayer.reverseNameResolverURL	// TODO: define protocol for reverse name resolver
                    }
                };

                if (gwLayer.nameResolver != undefined) {
                    planetConfiguration.nameResolver = {
                        "zoomFov": 200000, // in fact it must be distance, to be improved
                        "baseUrl": gwLayer.nameResolver.baseUrl,
                        "jsObject": gwLayer.nameResolver.jsObject
                    }
                }

                planetConfiguration.renderContext['shadersPath'] = "../mizar_lite/externals/GlobWeb/shaders/";
                planetConfiguration = $.extend({}, options, planetConfiguration);
                if (!planetDimension) {
                    planetDimension = "3d";
                }
                planetConfiguration.mode = planetDimension;
                planetContext = new PlanetContext(parentElement, planetConfiguration);
                planetContext.setComponentVisibility("categoryDiv", true);
                planetContext.setComponentVisibility("searchDiv", true);
                planetContext.setComponentVisibility("posTracker", mizarCore.activatedContext.components.posTracker);
                planetContext.setComponentVisibility("elevTracker", mizarCore.activatedContext.components.posTracker);
                planetContext.setComponentVisibility("compassDiv", false);
                planetContext.setComponentVisibility("measureContainer", true);
                planetContext.setComponentVisibility("switch2DContainer", false);

                // Propagate user-defined wish for displaying credits window
                planetContext.credits = skyContext.credits;

                // Planet tile error treshold is less sensetive than sky's one
                mizarCore.sky.renderContext.tileErrorTreshold = 3;
                mizarCore.activatedContext = planetContext;
                // Store old view matrix & fov to be able to rollback to sky context
                mizarCore.oldVM = mizarCore.sky.renderContext.viewMatrix;
                mizarCore.oldFov = mizarCore.sky.renderContext.fov;

                if (planetContext.mode == "3d") {
                    //Compute planet view matrix
                    var planetVM = mat4.create();
                    planetContext.navigation.computeInverseViewMatrix();
                    mat4.inverse(planetContext.navigation.inverseViewMatrix, planetVM);

                    // Add smooth animation from sky context to planet context
                    mizarCore.navigation.toViewMatrix(planetVM, 45, 2000, function () {
                        planetContext.show();
                        planetContext.globe.refresh();
                        mizarCore.publish("mizarMode:toggle", gwLayer);
                    });
                }
                else {
                    planetContext.show();
                    planetContext.globe.refresh();
                    mizarCore.publish("mizarMode:toggle", gwLayer);
                }

                if (!mizarGui.measureToolPlanet) {
                    mizarGui.measureToolPlanet = new MeasureToolPlanet({
                        globe: planetContext.globe,
                        navigation: planetContext.navigation,
                        planetLayer: planetContext.planetLayer,
                        isMobile: mizarCore.isMobile,
                        mode: mizarCore.mode
                    });
                }

                // desactive the sky measure tool
                if (!_.isEmpty(mizarGui.measureToolSky) && mizarGui.measureToolSky.activated)
                    mizarGui.measureToolSky.toggle();

                //planetContext.globe.isSky = true;
                mizarCore.navigation.globe.isSky = true;
                planetContext.setComponentVisibility("measurePlanetContainer", true);
            }
        };

        return MizarWidgetGui;
    });
