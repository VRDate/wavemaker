/*
 * Copyright (C) 2008-2013 VMware, Inc. All rights reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

dojo.provide("wm.studio.pages.Studio.Studio");

dojo.require("dojo.cookie");
dojo.require("wm.base.components.Page");
dojo.require("wm.base.widget.Content");
dojo.require("wm.base.widget.Panel");
dojo.require("wm.base.widget.Bevel");
dojo.require("wm.base.widget.Splitter");
dojo.require("wm.base.widget.Button");
dojo.require("wm.base.widget.Picture");
dojo.require("wm.base.widget.Layers");
dojo.require("wm.base.widget.Layout");
dojo.require("wm.base.widget.Tree");
dojo.require("wm.base.design.Designer");

//wm.logging = true;

// abort javadoc thing
loadFrames = function() {};

wm.disEnableButton = function(inBtn, inDisEnable) {
    var a = ["setAttribute", "removeAttribute"], d = "disabled";
    inBtn[a[Number(Boolean(inDisEnable))]](d, d);
};

dojo.declare("Studio", wm.Page, {
    manageURL: true,
    i18n: true,

    // FIXME: flag for testing if we're actual studio class
    // used for automatic studio page unloading.
    _isWaveMakerStudio: true,
    _outlineClass: "Studio-outline",
    _explodeClass: "Studio-exploded",
    studioKeyPriority: false,
    userName: "",
    resourcesLastUpdate: 0,
    _deploying: false,
    //obsolete?
    _runRequested: false,
    currentDeviceType: "desktop",
    //=========================================================================
    // initialization
    //=========================================================================
    start: function(inBackState, inLocationState) {
        this.subscribe("BrowserZoomed", this, "browserZoomed");
        this.browserZoomed();
        wm.applyFrameworkFixes();
        this.progressDialog.titleButtonPanel.setShowing(true);
        //this.progressDialog.titleClose.setShowing(true);
        this.connect(this.navigationMenu, "renderDojoObj", this, function() {
            this.disableMenuBar(!studio.application);
        });
        studio.studioService.requestAsync("getStudioEnv", [], function(inResult) {
            wm.studioConfig.environment = inResult;
			if(studio.startPageDialog.page){
				studio.startPageDialog.page.setCloudSplash();
			}
        });
        if (dojo.isIE && dojo.isIE < 8) {
            app.alert(this.getDictionaryItem("ALERT_OLD_IE_BAD"));
            app.alertDialog.setButton1Caption("");
            return;
        }

        /* Create an empty patches file if there isn't one already */
        studio.resourceManagerService.requestSync("writeFileIfDoesNotExist", ["/common/" + wm.version.replace(/[^a-zA-Z0-9]/g, "") + "_patches.js", ""]);

        if (wm.EditArea && this.editArea instanceof wm.EditArea) {
            this.scriptPageCompletionsBtn.hide();
            this.scriptPageFormatBtn.hide();
            this.appsrcPageFormatBtn.hide();
        }

        app._page = this; // not sure why this was failing to set, but I don't have time to investigate...
        this.neededJars = {};
        /*
        try{
            this.documentationDialog = new wm.RichTextDialog({_classes: {domNode: ["studiodialog"]},
                                      owner: this,
                                      name:"documentationDialog"});
            this.connect(this.documentationDialog, "onOkClick", this, "saveDocumentation");
        }
        catch(e){
            console.info('error while creating RichTextDialog for documentation.');
        }
        */

        this.trackerImage.setSource("http://wavemaker.com/img/blank.gif?op=studioLoad&v=" + escape(wm.studioConfig.studioVersion) + "&r=" + String(Math.random(new Date().getTime())).replace(/\D/, "").substring(0, 8));

        this.project = new wm.studio.Project();
        /*
        this.startEditor = studio.addEditor("Start");
        this.startEditor.connect(this.startEditor, "onStart", this, "startPageOnStart");
        */
        //this.startPageDialog.fixPositionNode = this.tabs.domNode;

        this.startPageDialog.show();
        this.startPageDialog.dialogScrim.domNode.style.opacity = 0.7;
        // set this up now because we won't be able to load it when the session has expired

        // get user configuration settings
        this.initUserSettings();

        // FIXME: hack
        //this.owner = app;

        this.scrim = new wm.Scrim({
            owner: this,
            name: "studioScrim",
            _classes: {
                domNode: ["wmdialog-scrim"]
            },
            waitCursor: false,
            _noAnimation: true
        });
        // populate palettes
        loadPackages();
        this.disableMenuBar(true);
        // init some UI
        this.outlinedClick();
        if (this.getUserSetting('explode')) {
            this.explodedClick();
        }
        var multiActiveProperties = this.getUserSetting("multiActive");
        studio.inspector.preferredMultiActive = multiActiveProperties;
        studio.inspector.multiActive = studio.inspector.preferredMultiActive;
        this.togglePropertiesMultiactiveItem.set("checked", !this.inspector.multiActive);


        /*
        if (wm.studioConfig.preventLiveData)
            this.liveLayoutBtn.setDisabled(true);
        */


        this.clearTrees();
        // Listen to some events
        //this.connect(document, "keydown", this, "keydown");
        this.connect(wm.inflight, "change", this, "inflightChange");
        // Unload protection
        if (wm.studioConfig.preventUnloadWarning) dojo.connect(window, "onbeforeunload", this, "windowUnload");
        // Listen to some topics
        dojo.subscribe("wm-textsizechange", this, "reflow");
        dojo.subscribe("wmwidget-rename", this, "componentRenamed");
        // set up status update poll
        // FIXME: can't we do status updates via dojo.publish?
        //setInterval(dojo.hitch(this, "updateStatus"), 2000);
        //this.preloadImages();
        if (this.isCloud()) {
            this.preferencesItem.domNode.style.display = "none";
            this.partnerServicesItem.domNode.style.display = "none";
        }
        var reopenProject = this.getUserSetting("reopenProject");
        if (reopenProject) {
            this.setUserSettings({
                reopenProject: ""
            });
            this.project.openProject(reopenProject);
        } else if (inLocationState) {
            this.restoreFromLocationHash(inLocationState);
        } else {
            studio.disableMenuBar(true);
        }

        /*
        if (this.isCloud()) {
            this.navLogoutBtn.setShowing(true);
            this.navEditAccountBtn.setShowing(true);
            this.projectNameLabel.setShowing(false);
        }*/


        /* Removal of projects tab
        this.updateProjectTree();
        */
        this.subscribe("session-expiration-servicecall", this, "handleSessionExpiration");
        this.subscribe("service-variable-error", this, "handleServiceVariableError");

        this.loadThemeList();
        this.cssHelpLink.setLink(this.getDictionaryItem("URL_STYLE_DOCS", {
            studioVersionNumber: wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/, "$1")
        }));
        this.appCssHelpLink.setLink(this.getDictionaryItem("URL_STYLE_DOCS", {
            studioVersionNumber: wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/, "$1")
        }));

        this.helpDialog.containerWidget.c$[0].setPadding("0");
        this.helpDialog.containerWidget.c$[0].setBorder("10");
        this.helpDialog.containerWidget.c$[0].setBorderColor("#424959");
        //this.scriptPageCompileChkBtn.setChecked(dojo.cookie(this.scriptPageCompileChkBtn.getRuntimeId()) == "true");
        //this.appsrcPageCompileChkBtn.setChecked(dojo.cookie(this.scriptPageCompileChkBtn.getRuntimeId()) == "true");

        // attempt to allow autoscroll while killing the left-to-right scrolling
        dojo.connect(studio.tree, "renderCss", studio.tree, function() {
            this.domNode.style.overflowX = "hidden";
        });


        /*
        this.propertiesDialog.containerWidget.setPadding("0");
        this.propertiesDialog.containerWidget.setAutoScroll(false);
        */

        this._jarsMissing = {};
        this.jarListService.requestAsync("getMissingJars").addCallback(dojo.hitch(this, function(inResult) {
            for (var i = 0; i < inResult.length; i++) {
                this._jarsMissing[inResult[i]] = true;
            }
            if (this._jarsMissing["hibernate3.jar"]) {
                app.confirm(this.getDictionaryItem("STUDIO_CONFIG_TOOL_NOT_RUN"), false,

                function() {
                    window.location = "/ConfigurationTool";
                });
            }
        }));

        /* Do this test at the end so that the dialog will be at the top z-index */
        if (dojo.isIE == 8) {
            app.warnOnce("dontRunStudioInIE8", this.getDictionaryItem("DONT_RUN_IE8"));
        }


        /*
        this.pageSelect.setParent(null);
        this.tabs.decorator.tabsControl.domNode.appendChild(this.pageSelect.domNode)
        var s = this.pageSelect.domNode.style;
        s.left = "0px";
        s.top = "0px";
        s.margin = "0";
        s.padding = "0";
        s.position = "relative";
        s.display = "inline-block";
        this.pageSelect.renderBounds = function() {};
        */


        this.connect(this.devicesRibbonInner, "setShowing", this.ribbon, "setBestHeight");
        this.connect(this.docRibbonInner, "setShowing", this.ribbon, "setBestHeight");
        this.ribbon.setBestHeight();

        this.connect(this.webServiceSubTab, "_setLayerIndex", dojo.hitch(this, "updateServiceTabStyle", this.webServiceSubTab));
        this.connect(this.databaseSubTab, "_setLayerIndex", dojo.hitch(this, "updateServiceTabStyle", this.databaseSubTab));
        this.connect(this.JavaEditorSubTab, "_setLayerIndex", dojo.hitch(this, "updateServiceTabStyle", this.JavaEditorSubTab));
    },
    updateServiceTabStyle: function(inSender) {
    if (inSender.layers.length <= 1) {
        inSender.setClientBorder("0");
        inSender.removeUserClass("StudioDarkerLayers");
    } else {
        inSender.setClientBorder("1,0,0,0");
        inSender.addUserClass("StudioDarkerLayers");
    }
    },
/*
     startPageOnStart: function() {
        this.startLayer = this.startEditor.parent;
        if (!this.getUserSetting("useLop") || !this.getUserSetting("defaultProject")) {
            this.startLayer.activate();
        }
     },
     */
         isJarMissing: function(inName) {
         return this._jarsMissing[inName];
     },
    handleMissingJar: function(jar, step1) {
        this.jarDownloadDialog.setPage("HandleRequiredJars");
        this.neededJars[jar] = true;
        if (!this.project.loadingProject) {
            this.jarDownloadDialog.page.html1.setHtml(step1);
            this.jarDownloadDialog.show();
        } else {
            var count = 0;
            for (var i in this.neededJars) count++;
            this.jarDownloadDialog.page["html" + count].setHtml(step1);
            this.jarDownloadDialog.page["layer" + (count * 2 - 1)].show();
            this.jarDownloadDialog.page["layer" + (count * 2)].show();
        }

    },
    handleServiceVariableError: function(inServiceVar, inError) {
        studio.endWait(); // if there was a beginWait call in progress, then we'd best close it in case there is no suitable error handler for the call
    },
    handleSessionExpiration: function(serviceVar) {
        if (serviceVar.isDesignLoaded() || serviceVar.isAncestor(studio.page)) {
            this.statusBarLabel.setCaption("Security Error <span class='StudioHelpIcon'/>");
            var node = dojo.query(".StudioHelpIcon", this.statusBarLabel.domNode)[0];
            dojo.connect(node, "onmouseover", this, function(e) {
                app.createToolTip(this.getDictionaryItem("TOOLTIP_SECURITY_ERROR"), node, e);
            });
            dojo.connect(node, "onmouseout", this, function() {
                app.hideToolTip();
            });

        } else {
            if (!this.isLoginShowing()) {
                if (!studio.getUserName()) {
                    wm.logout();
                } else {
                    studio.navGoToLoginPage();
                }
            }
        }
    },
    isCloud: function() {
        return wm.studioConfig.environment && wm.studioConfig.environment != "local";
        //return  this.isModuleEnabled("cloud", "wm.cloud");
    },
    preloadImages: function() {
        var p = "images/", t = "lib/wm/base/widget/themes/default/images/";
        wm.preloadImage(p + "loadingThrobber.gif");
        wm.preloadImage(p + "properties_16.png");
        wm.preloadImage(p + "inspector_bound.gif");
        wm.preloadImage(p + "project_16t.png");
        wm.preloadImage(p + "colorwheel_16.png");
        wm.preloadImage(p + "lock_16.png");
        wm.preloadImage(p + "group_open.gif");
        wm.preloadImage(p + "star_16.png");
        wm.preloadImage(p + "inspector_bind.gif");
        wm.preloadImage(t + "tree_closed.gif");
    },
    windowUnload: function(e) {

        if (this._isLogout) return;
        if (this._forceExit) return;
        var
        u = this.getDictionaryItem("ALERT_UNSAVED_LOST"),
            s = this.getDictionaryItem("ALERT_NO_UNSAVED"),
            m = this.isProjectDirty() ? u : s;
        e.returnValue = m;
        if (!m) dojo.publish("wm-unload-app");
        // safari requires value to be returned like this...
        return m;
    },
    //=========================================================================
    // User Settings
    //=========================================================================
    initUserSettings: function() {
        this._userSettings = dojo.fromJson(dojo.cookie("wmStudioSettings")) || {};
    },
    setUserSettings: function(inProps) {
        dojo.mixin(this._userSettings, inProps || {});
        dojo.cookie("wmStudioSettings", dojo.toJson(this._userSettings), { expires: 365 });
    },
        toggleMultiactive: function() {
        this.inspector.toggleMultiactive();
        this.setUserSettings(dojo.mixin(this._userSettings || {}, {multiActive: this.inspector.preferredMultiActive}));
    },
    getUserSetting: function(inProp) {
        return (this._userSettings || 0)[inProp];
    },
    //=========================================================================
    // Module Management
    //=========================================================================
    //=========================================================================
    // Project Related Management
    //=========================================================================
    projectChanging: function() {
        this.clearProjectPages();
        this.setLiveLayoutReady(this.isCloud() ? 0 : false);
        if (this.application) {
            var c = this.application.declaredClass;
            wm.fire(this.application, "destroy");
            this.removeClassCtor(c);
            this.application = null;
        }
        this.clearTrees();
/*
        if (this.propertiesDialog.showing)
        this.propertiesDialog.hide();
        */
        if (!this._loadingApplication) {
            wm.typeManager.clearTypes();
            wm.services.clear();
            wm.roles = [];
        }
        this.updateProjectDirty();
        //
        if (this.project.projectName)
            this.navGotoDesignerClick();
    },
    projectChanged: function(inName, inAppData) {
        var b = this.application && this.page;
        if (inName == this.project.projectName) {
            this.projectNameLabel.setCaption(inName);
            this.setUserSettings({
                defaultProject: inName
            });
            this.setAppCss(inAppData.css || "");
            this.setAppScript(inAppData.jscustom || "");
            this.setCleanApp();
            this.updateWindowTitle();
            // open in designer
            // switch to designer
            if (b) {
                studio.startPageDialog.hide();
                this.navGotoDesignerClick();
                this.mlpal.activate();
                this.paletteSearch.focus(); // this is done to help FF contextual menus work; else we get crazy stupid errors
                this.deploymentService.requestAsync("getDeploymentInfo", [], dojo.hitch(this, "getDeploymentInfoSuccess"));
                var d = studio.pagesService.requestAsync("listDictionaries", [], dojo.hitch(this, function(inData) {
                    var options = ["default", "en", "es", "ja", "fr", "it", "nl", "pt", "cn"];
                    for (var i = 0; i < inData.length; i++) {
                        if (dojo.indexOf(options, inData[i]) == -1) {
                            options.push(inData[i]);
                        }
                    }
                    options.push("other");
                    this.languageSelect.setOptions(options.join(","));
                })).then(function() {
                    studio.securityConfigService.requestSync("getRoles", [], function(inData) {
                        wm.roles = inData;
                        studio.application._roles = inData;
                    });
                });
                this.disableMenuBar(false);
                if (this.currentDeviceType == "phone") {
                    this.designPhoneUI(false);
                } else if (this.currentDeviceType == "tablet") {
                    this.designTabletUI(true);
                }
            } else if (!this.isLoginShowing()) {
                if (!wm.isEmpty(this.project.projectData)) {
                    if (app.alertDialog && app.alertDialog.showing && !app.alertDialog._hideAnimation) app.alertDialog.show(); // insure the alert dialog is over the startPageDialog
                    this.disableMenuBar(false);
                    this.insertPopupBtn.set("disabled", true);
                    this.servicesPopupBtn.set("disabled", true);
                    this.pagePopupBtn.set("disabled", true);
                } else {
                    studio.startPageDialog.show();
                    if (app.alertDialog && app.alertDialog.showing) app.alertDialog.show(); // raise it above the start page
                    if (app.toastDialog && app.toastDialog.showing) app.toastDialog.show();
                    this.disableMenuBar(true);
                }
                //this.startLayer.activate();
                //this.projects.activate();
            } else {
                this.disableMenuBar(true);
            }
            if (!b) {
                studio.inspector.reset();
            }
            // mount project so live services and the resources folder can be accessed;
            // somewhere there is code so that live services will autodeploy the project, but this doesn't work for resources;
            // at some point a cleanup of that code may be needed.
            /* deployStatus will probably be set already if any autoUpdate/startUpdate services fire during initialization */
            if (!wm.studioConfig.preventLiveData && inName != '' && studio.application && !this.isCloud()) {
                studio.deploy(null, "studioProjectCompile", true);
            }

        }

        //this.disableCanvasSourceBtns(!b);
        /* Removal of projects tab
        this.updateProjectTree();
        */

        if (inName && inName != "") { // if project has closed, don't need to publish
            if (inName == this.project.projectName) { // if project is changing, first call to this function will have different project name, only publish on second call
                dojo.publish("wm-project-changed");
            }
        }

        if (!djConfig.isDebug) {
            this.setupDefaultContextMenu();
        }
    },
    getDeploymentInfoSuccess: function(inResult) {
        this._deploymentData = inResult;
        this.updateDeploymentsMenu();
        if (this.deploymentDialog.page) this.deploymentDialog.page.reset();
    },
    setupDefaultContextMenu: function() {
    var f = function(e) {

        if (e.target.tagName == "INPUT" || e.target.tagName == "TEXTAREA" || dojo.hasClass(e.target, "ace_layer")) return true;
        dojo.stopEvent(e);
        var menuObj = studio.contextualMenu;
        menuObj.removeAllChildren();

        menuObj.addAdvancedMenuChildren(menuObj.dojoObj,
                        {"label": this.getDictionaryItem("MENU_ITEM_TUTORIALS"),
                         iconClass: "StudioHelpIcon",
                         onClick: function() {window.open(this.getDictionaryItem("URL_TUTORIALS", {studioVersionNumber: wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/,"$1")}), "Docs");}
                        });
        menuObj.addAdvancedMenuChildren(menuObj.dojoObj,
                        {"label": this.getDictionaryItem("MENU_ITEM_DOCS"),
                         iconClass: "StudioHelpIcon",
                         onClick: function() {window.open(this.getDictionaryItem("URL_DOCS", {studioVersionNumber: wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/,"$1")}), "Docs");}
                        });
        menuObj.addAdvancedMenuChildren(menuObj.dojoObj,
                        {"label": this.getDictionaryItem("MENU_ITEM_PROPDOCS"),
                         iconClass: "StudioHelpIcon",
                         onClick: function() {window.open(this.getDictionaryItem("URL_PROPDOCS", {studioVersionNumber: wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/,"$1")}), "Docs");}
                        });

        menuObj.dojoObj.addChild(new dijit.MenuSeparator());
        menuObj.addAdvancedMenuChildren(menuObj.dojoObj,
                        {"label": this.getDictionaryItem("MENU_ITEM_COMMUNITY"),
                         iconClass: "StudioHelpIcon",
                         onClick: function() {window.open(this.getDictionaryItem("URL_FORUMS"), "Forums");}
                        });

        menuObj.update(e);
    };
    dojo.connect(this.domNode, "oncontextmenu", this, f);
    if (dojo.isFF < 5) {
        dojo.connect(this.domNode, "onmousedown", this, function(e) {
        if (e.button == 2 || e.ctrlKey)
        dojo.hitch(this, f)(e);
        });
    }
    },
    pageChanging: function() {
        wm.undo.clear();
        if (!this.page)
            return;
            this.languageSelect.beginEditUpdate();
            this.languageSelect.setDisplayValue("default");
            this.languageSelect.endEditUpdate();
        this.select(null);
        this.setScript("");
        var c = this.page.declaredClass;
        wm.fire(this.page, "destroy");
        this.removeClassCtor(c);
        this.page = null;
        if (this.project.pageName) {
        this.navGotoDesignerClick();
        }
    },
    pageChanged: function(inName, inPageData) {
        this.setScript(inPageData.js);
        this.setCss(inPageData.css || "");
        this.cssChanged();
        this.setMarkup(inPageData.html || "");
        this.setCleanPage(inPageData);
        this.editAreaFullPath.setCaption("webapproot/pages/" + inName + "/" + inName + ".js");
        this.cssEditAreaFullPath.setCaption("webapproot/pages/" + inName + "/" + inName + ".css");
        this.markupEditAreaFullPath.setCaption("webapproot/pages/" + inName + "/" + inName + ".html");
            this.mobileFoldingToggleButton.setDisabled(!studio.page || !studio.page.enableMobileFolding);
            dojo.attr(this.mobileFoldingToggleButton.domNode, "disabled", false); // disabled means no mouseover and no hint

            if (this.page) {
            this.select(this.page.root);
            this.refreshDesignTrees();
        }

        if (this.page) {
            var deviceType = this.page.getPreferredDevice();
            if (deviceType && deviceType != this.currentDeviceType) {
                switch (deviceType) {
                case "tablet":
                    this.tabletToggleButton.click();
                    break;
                case "phone":
                    this.phoneToggleButton.click();
                    break;
                default:
                    this.desktopToggleButton.click();
                }
            } else {
                switch (this.currentDeviceType) {
                case "tablet":
                    this.designTabletUI();
                    break;
                case "phone":
                    this.designPhoneUI();
                    break;
                default:
                    this.designDesktopUI();
                }
            }
        }
        dojo.publish("wm-page-changed");
        this.pagesChanged();
    },
    pagesChanged: function() {
        this.updateWindowTitle();
        this.refreshPagePalette();
                /* Removal of projects tab
        this.updateProjectTreePages();
        */
    },
    projectsChanged: function() {
                /* Removal of projects tab
        this.updateProjectTree();
        */
    },
    restoreFromLocationHash: function(inValue) {
    if (inValue && typeof inValue == "object" && inValue.studio && inValue.studio && inValue.studio) {
        inValue = inValue.studio;
        if (inValue.projectName && inValue.pageName) {
        var d = this.project.openProject(inValue.projectName, inValue.pageName);
        if (inValue.deviceType == "tablet") {
            this.devicesTogglePanel.setCurrentButton(this.tabletToggleButton);
        } else if (inValue.deviceType == "phone") {
            this.devicesTogglePanel.setCurrentButton(this.phoneToggleButton);
        }
        d.addCallback(dojo.hitch(this, function() {
            var tabsIndex = inValue[studio.tabs.getRuntimeId()];
            if (tabsIndex != undefined) {
            this.tabs.setLayerIndex(tabsIndex);
            }
            var leftIndex = inValue[studio.tabs.getRuntimeId()];
            if (leftIndex != undefined) {
            this.left.setLayerIndex(leftIndex);
            }
        }));
        }
    }
    },
    generateStateUrl: function(stateObj) {
    if (this.project && this.project.projectName && this.project.pageName) {
        stateObj[this.getRuntimeId()] = {pageName: this.project.pageName,
                         projectName: this.project.projectName,
                         deviceType: this.currentDeviceType};
    } else {
        stateObj[this.getRuntimeId()] = {deviceType: this.currentDeviceType};

    }
    },

    updateWindowTitle: function() {
        var project = studio.application ? studio.application.declaredClass : "";
        var page = studio.page ? studio.page.declaredClass : "";
        var main = studio.application ? studio.application.main : "";
        var title = [];
        if (project)
            title.push(project);
        if (page)
            title.push(page + (page == main ? " (Home)" : ""));
        title.push("WaveMaker Studio");
        window.document.title = title.join(" - ");
    },
    updateFullServiceList: function() {
        studio.updateServices();
        studio.application.loadServerComponents();
        studio.refreshServiceTree();
    },
    updateServices: function() {
        wm.typeManager.clearTypes();
        if (this.isLiveLayoutReady()) this.setLiveLayoutReady(studio.isCloud() ? -1 : false);
        this.servicesService.requestSync("listTypes", [], dojo.hitch(this, "typesChanged"));
        this.servicesService.requestSync("listServicesWithType", [], dojo.hitch(this, "servicesDataChanged"));
            studio.refreshServiceTree();
    },
    typesChanged: function(inData) {
        if (this._inRestoreCleanApp) return;
        if (inData && inData.types) {
        wm.typeManager.setTypes(inData.types);
        }
        wm.dataSources.update();
        this.refreshDataPalette();
        if (this.application || this._application)
        dojo.publish("wmtypes-changed");
    },
    servicesDataChanged: function(inData) {
        // clear non-client services from registry
        wm.services.clear();
        // repopulate non-client service registry
        for (var d in inData) {
            wm.services.add({ name: d, type: inData[d] });
        }
        dojo.publish("wmservices-changed");
    },
        getImageLists: function() {
            var obj = studio.page;
            var list = [];
            for (var i in obj.components) {
                if (wm.isInstanceType(obj.components[i], wm.ImageList))
                    list.push(obj.components[i].getId());
            }
            obj = studio.application;
            for (var i in obj.components) {
                if (wm.isInstanceType(obj.components[i], wm.ImageList))
                    list.push(obj.components[i].getId());
            }
            return list;
        },

    refreshPagePalette: function() {
        var
            palette = studio.palette,
            list = this.project.getPageList(),
                    caption = bundlePackage.PageContainers,
            desc = bundlePackage.PageContainersDescription,
            image ="images/wm/pane.png";
        palette.clearSection(caption);
        for (var i = 0, current = studio.page ? studio.page.declaredClass : "", p; (p = list[i]); i++)
            if (current != p) {
                var n = p.toLowerCase() + "Page", props = { name: n, pageName: p };
                palette.addItem(caption, n, desc, image, "wm.PageContainer", "wm.base.widget.PageContainer", props);
            }
    },
    refreshDataPalette: function() {
        var
            palette = studio.palette,
            list = wm.dataSources.sources,
            caption = bundlePackage.Database,
                    desc = bundlePackage.DatabaseDescription,
            image ="images/wm/data.png";
        palette.makeGroup(caption, 6);
        palette.clearSection(caption);
        wm.forEach(list, function(l, i) {
            wm.forEach(l, function(d) {
                var liveDataName = d.caption.toLowerCase();
                var name = liveDataName + "LivePanel1";
                palette.addItem(caption, d.caption + " (" + i + ")", desc, image, "wm.LivePanel", "wm.base.components.DataModel", {name: name, liveDataName: liveDataName, liveSource: d.type});
            });
        });
    },
    themeChanged: function(inThemePackage) {
        var palette = studio.palette;
        try {
            var themeNode;
            studio.palette.root.forEachChild(function(n) {
                if (n.data == "Theme Widgets") themeNode = n;
            });
            if (themeNode) themeNode.removeChildren();
            var widgets = wm.load(dojo.moduleUrl(inThemePackage) + "packages.js");
            if (widgets) {
                widgets = eval("[" + widgets + "]");
                if (widgets.length && !themeNode) {
                    themeNode = palette.makeGroup("Theme Widgets", 1);
                }
                installPackages(widgets);
                if (widgets.length) {
                    studio.palette.findItemByName("Theme Widgets").setOpen(true);
                }
            }
            if (themeNode) {
                themeNode.setContent(wm.capitalize(inThemePackage.replace(/^.*\./,"")) + " Widgets");
                themeNode.domNode.style.display = themeNode.kids.length ? "" : "none";
            }
        } catch(e) {}
    },
    /* if isCloud, this will return -1 (true but needs to be updated), 0 (false, redeploy), or 1 (true)
     * if not isCloud this will return true or false (redeploy)
     */
    isLiveLayoutReady: function(inWarn) {
        return this._liveLayoutReady;
    },
    setLiveLayoutReady: function(inReady) {
        this._liveLayoutReady = inReady;
    },
    deploySuccess: function(inUrl) {
        if (inUrl) this._deployedUrl = inUrl;
        var application = this.application || this._application;
        if (application._deployStatus == "deploying") application._deployStatus = "deployed";

        this.setLiveLayoutReady(studio.isCloud() ? 1 : true);
        var previewWindowOptions = this.getPreviewWindowOptions();
        if (this.previewWindow && this.previewWindowOptions != previewWindowOptions) this.previewWindow.close();
        this.previewWindowOptions = previewWindowOptions;
        switch (this._runRequested) {
        case "studioProjectCompile":
            break;
        case "studioProjectTest":
            this.previewWindow = wm.openUrl(this.getPreviewUrl(inUrl, true), studio.getDictionaryItem("POPUP_BLOCKER_LAUNCH_CAPTION"), "_wmPreview", this.previewWindowOptions);
            break;
        case "studioProjectRun":
            this.previewWindow = wm.openUrl(this.getPreviewUrl(inUrl, false), studio.getDictionaryItem("POPUP_BLOCKER_LAUNCH_CAPTION"), "_wmPreview", this.previewWindowOptions);
            break;
        }
        this._runRequested = false;
        this.updateStateWhileDeploying(true);
    },
    allowDisablingOfServiceItems: true,
    updateStateWhileDeploying: function(isDeployed) { /* Only if there is an app open */
        if (this.allowDisablingOfServiceItems && studio.application && this.isCloud()) {
             dojo.publish("testRunStateChange");
            //this.servicesPopupBtn.set('disabled', !isDeployed); // see also menu.js disableMenuBar
            this.disableMenuBar(false);
        }
    },
    deployError: function(result) {
    var application = this.application || this._application;
    if (!application) return;
    console.log("DEPLOY ERROR: " + result);
    if (application._deployStatus == "deploying")
        application._deployStatus = "";

        if (result.message && result.message.match(/Application already exists at/)) {
            this.deploySuccess();
            return true;
        } else {
        this.updateStateWhileDeploying(true); /* Enable the service menu even though there may not be an app there */
        if (result.dojoType != "cancel" && app.toastDialog && (!app.toastDialog.showing || app.toastDialog._toastType != "Warning" && app.toastDialog._toastType != "Error"))
        app.toastError(this.getDictionaryItem("TOAST_RUN_FAILED", {error: result.message}));
        this._deploying = false; // obsolete?
        this._runRequested = false;
        return result;
        }
    },
    deploy: function(inMsg, deployType, noWait) {
        var application = this.application || this._application;
        if (!application || application._deployStatus == "deploying") {
            if (!deployType.match(/compile/i)) this._runRequested = deployType;
            return this._deployer;
        }
        application._deployStatus = "deploying";

        this._runRequested = deployType;
        var d = this._deployer = studio.deploymentService.requestAsync("testRunStart");
        d.addCallback(dojo.hitch(this, "deploySuccess"));
        d.addErrback(dojo.hitch(this, "deployError"));
        if (!noWait) this.waitForDeferred(d, inMsg);
        this.updateStateWhileDeploying(false);
        return d;
    },

    //=========================================================================
    // Source control
    //=========================================================================
    getScript: function() {
        return this.editArea.getText();
    },
    setScript: function(inScript) {
            //this["_cachedEditDataeditArea"] = inScript;
        this.editArea.setDataValue(inScript);
    },

    getAppScript: function() {
        return this.appsourceEditor.getText();
    },
    setAppScript: function(inScript) {
        //this["_cachedEditDataappsourceEditor"] = inScript;
        this.appsourceEditor.setDataValue(inScript);
    },
    getWidgets: function() {
        return this.page ? sourcer(this.project.pageName, this.page) : "";
    },
    pageNameChange: function(inOldName, inNewName) {
        this.setScript(this.getScript().replace(new RegExp("\\b" + inOldName + "\\b"), inNewName));
        this.setCss(this.getCss().replace(new RegExp("\\." + inOldName + "\\b", "g"), "." + inNewName));
        this.cssChanged();
        this.page.name = inNewName;
        this.refreshDesignTrees();
    },
    getProjectDesignPath: function() {
        return wm.Component.prototype.getPath();
    },
    designifyCss: function(inCss) {
        var p = this.getProjectDesignPath();
        // if relative paths to images are used in css, prepend the project design path
        // so that the image is resolved at designtime.
        return inCss.replace(/url\s*\(\s*([^(http:)\/].*)\.*\)/g, "url(" + p + "$1)");
    },
    designifyMarkup: function(inMarkup) {
        var p = this.getProjectDesignPath(); ;
        // if relative paths to images are used in html, prepend the project design path
        // so that the image is resolved at designtime.
        return inMarkup.replace(/<img([^>]*)src[^>]*=[^>]*(["'])([^(http:)\/][^>]*)\2/g, '<img$1src="' + p + '$3"');
    },
    getCss: function() {
        return this.cssEditArea.getText();
    },
    getAppCss: function() {
        return this.appCssEditArea.getText();
    },
    setCss: function(inCss) {
        //this["_cachedEditDatacssEditArea"] = inCss;
        this.cssEditArea.setText(inCss);
        this.cssChanged();
    },
    setAppCss: function(inCss) {
        //this["_cachedEditDataappCssEditArea"] = inCss;
        this.appCssEditArea.setText(inCss);
        this.cssChanged();
    },
    cssChanged: function() {
        setCss("page_ss", this.designifyCss(this.getCss()));
        setCss("app_ss", this.designifyCss(this.getAppCss()));
        this.reflow();
    },
    getMarkup: function() {
        return this.markupEditArea.getText();
    },
    setMarkup: function(inScript) {
        //this["_cachedEditDatamarkupEditArea"] = inScript;
        this.markupEditArea.setText(inScript);
        this.markupChanged();
    },
    markupChanged: function() {
        if (this.page) {
        studio.markup.domNode.innerHTML = this.designifyMarkup(this.getMarkup());
            // re-inspect selected control since markup change may influence inspector
        this.inspect(this.selected || this.page.root);
        dojo.publish("wm-markupchanged");
        }
    },
    //=========================================================================
    // Control Management
    //=========================================================================
    makeName: function(inType) {
        //var n = inType.replace("wm.", "").replace("dijit.", "").replace("wm.", "");
        var n = inType.replace(/^.*\./,"");
        n = n.substring(0, 1).toLowerCase() + n.substring(1);
        // default name includes trailing 1
        return n.replace(/\./g, "") + "1";
    },
    findContainer: function(inControl, inType) {
        // identify selected container
        var c = inControl
        while (c && !(c.container && c.isWidgetTypeAllowed(inType) && !c.getFreeze())) { c = c.parent };
        return c;
    },
    newComponent: function(inType, inProps) {
        var tree = this.compTree;
        // FIXME: redundant
        var ctor = dojo.getObject(inType), p = (ctor || 0).prototype;
        /* TODO: tree.selected may now be an array? */
        var s = tree.selected || 0, c = s.component || 0, owner = c.owner || s.owner || this.page;
        return owner.createComponent(this.makeName(inType, owner), inType, inProps);
    },
    _newWidget: function(inType, inProps, inParent) {
        inProps = inProps || {};
        var n = inProps.name || inType;
        var c = this.page.loadComponent(this.makeName(n), inParent, inType, inProps);
        //this.page.reflow();
        return c;
    },
    newWidget: function(inType, inProps) {
        var p = this.findContainer(this.selected[0], inType) || studio.page.root.findContainer(inType);
        if (p)
            return this._newWidget(inType, inProps, p);
        else
            app.alert(this.getDictionaryItem("ALERT_NEW_WIDGET_NEEDS_CONTAINER"));// don't think this is every used
    },
    _marshall: function(inType) {
        return dojo.getObject(inType) || dojo.declare(inType, wm.Label, { caption: inType });
    },
    _make: function(inType, inProps) {
        inProps = inProps || {};
        var ctor = this._marshall(inType);
        if (ctor) {
            var isWidget = ctor.prototype instanceof wm.Widget || ctor.prototype instanceof dijit._Widget;
            // flag for behavior to occur only upon initial creation
            inProps._studioCreating = true;
            var c = isWidget ? this.newWidget(inType, inProps) : this.newComponent(inType, inProps);
            if (c) {
                c._studioCreating = false;
            studio.inspect(c);
            }
            return c;
        }
    },
    _add: function(inComponent) {
        if (!inComponent)
            return;
        new wm.AddTask(inComponent);
        if (!(inComponent instanceof wm.Widget))
            this.addComponentToTree(inComponent);
        // NOTE: Addresses Russian Doll syndrome. Don't select panels by default.
        if (!(inComponent instanceof wm.Container)) {
            this.select(inComponent);
            this.inspect(inComponent);
        }
        this.page.reflow();
        return inComponent;
    },
    make: function(inType, inProps) {
        return this._add(this._make(inType, inProps));
    },
        _lastBindSelect: null,
    reinspect: function(forceRegen) {

        if (this.inspector && this.inspector.inspected && !forceRegen) {
         this.inspector.reinspect();
        } else if (this.inspector  && forceRegen) {

            var inspected = this.inspector.inspected;
            this.inspector.inspected = null;
            if (inspected)
                this.inspector.inspect(inspected);
        }
    },
    inspect: function(inComponents) {
        if (!dojo.isArray(inComponents)) {
            if (inComponents instanceof wm.Component) inComponents = [inComponents];
        }
        //if (inComponent.noInspector) return;
        wm.job("studio.inspect", 1, dojo.hitch(this, function() {
            this._inspect(inComponents);
        }));
    },
    _inspect: function(inComponents) {
        inComponents = dojo.filter(inComponents, function(c) {return !c.isDestroyed;});
        if (inComponents.length == 0 || !this.application) return;

        // update label
        this.setInspectedCaption(inComponents[0]);
        // inspect component
        //studio.inspector.setLayerByCaption("Properties");
        studio.inspector.inspect(inComponents);
    },
    setInspectedCaption: function(inComponent) {
        this.PIContents.setTitle(inComponent ? inComponent.name + ': ' + (inComponent._designee.localizedDeclaredClass || inComponent._designee.declaredClass) : "(none)");
    },
    isSelected: function(inComponent) {
        if (!this.selected) return false;
        if (dojo.indexOf(this.selected, inComponent) != -1) return true;
        if (dojo.indexOf(this.inspector.inspected, inComponent) != -1) return true;
        return false;
    },
    select: function(inComponentOrArray, isNew) {
        if (this.inSelect) return;
        this.inSelect = true;
        try {
            var inComponents = dojo.isArray(inComponentOrArray) ? inComponentOrArray : !inComponentOrArray ? [] : [inComponentOrArray];
            inComponents =  dojo.filter(inComponents, function(c) {return !c.isDestroyed;});

            /* If the bind dialog is showing, then we aren't doing a bind selection rather than a regular studio select and inspect */

            if (studio.bindDialog && studio.bindDialog.showing && !studio.bindDialog._hideAnimation) {
                this.bindDialog.page.binderSource.searchBar.setDataValue("#" + inComponents[0].name);
                this._lastBindSelect = inComponents[0];
                return;
            }

            // if there is a bindSelect, then set selected to null so that we can force a reselect
            if (this._lastBindSelect) {
                this._lastBindSelect = null;
                this.selected = null;
            }

            /* If there has been no change in what is selected, then just make sure the Model tree shows
             * the selected widgets, and exit.
             */
            if (wm.Array.equals(this.selected,inComponents)) {
                dojo.forEach(this.selected, function(c) {
                    if (!c._studioTreeNode.selected)
                        c._studioTreeNode.tree.eventSelect(c._studioTreeNode, true);
                });
                return;
            }

            // if its a dialog or a widget within a dialog dismiss the dialog
            // unless the new selection IS in the dialog as well
            var showingDialogs = dojo.filter(wm.dialog.showingList, function(d) {return d._isDesignLoaded;});
            dojo.forEach(inComponents, function(selected) {
                if (selected instanceof wm.Control) {
                    var parentDialog = selected.getParentDialog();
                    if (parentDialog) {
                        if (!parentDialog.showing) parentDialog.show(); // show any dialogs with a selected item in it
                        var index = dojo.indexOf(showingDialogs, parentDialog);
                        if (index != -1) wm.Array.removeElementAt(showingDialogs); // remove from the list of old showing dialogs that need to be hidden any dialog that contains a selected item
                    }
                }
            });
            dojo.forEach(showingDialogs, function(d) {d.hide();});

            /* Deactivate any deselected components */
            dojo.forEach(studio.selected, function(c) {
                if (dojo.indexOf(inComponents, c) == -1) {
                    wm.fire(c, "deactivate");
                }
            });

            /* TODO: Fix handling of locked components in multiselect studio
            while (inComponent && inComponent.isParentLocked && inComponent.isParentLocked())
                inComponent = inComponent.parent;
            */

            if (inComponents.length) {
                if (this.treeSearch.getDataValue()) {
                    this.treeSearch.setDataValue("");
                    this.refreshVisualTree();
                }
                if (this.compTreeSearch.getDataValue()) {
                    this.compTreeSearch.setDataValue("");
                    this.refreshServiceTree();
                    this.refreshComponentTree();
                }
                var status = "Editing ";
                dojo.forEach(inComponents, function(c,i) { status += (i ? ", " : "") + c.toString();});
                this.statusBarLabel.setCaption(status);

            }
            try {
                var s = this.selected = inComponents;
                // make sure selected widget and all ancestors are showing
                if (!this._dontNavOnPageChange) {
                    this.revealSelected();
                }
                // select in designer
                this.designer.selectFromStudio(s);

                /* Update the selected tree items */
                if (this.tree.selected && dojo.indexOf(this.selected, this.tree.selected) == -1) this.tree.deselect();
                dojo.forEach([this.widgetsTree, this.compTree], function(inTree) {
                    dojo.forEach(inTree.selected, function(c) {
                        if (dojo.indexOf(this.selected, c) == -1) {
                            inTree.deselect(c._studioTreeNode);
                        }
                    }, this);
                }, this);

                this.selectInTree(this.selected);

                // show in inspector
                var inspectableComponents = dojo.filter(s, function(c) {return !c.noInspector;});
                if (inspectableComponents.length) {
                    this.inspect(inspectableComponents, true);
                }
                this.propertySearchBar.clear();
            } finally {
                this.updateCutPasteUi();
                this.updateStatus();
            }
        } finally{
            this.inSelect = false;
        }
    },
    revealSelected: function() {
        // if the widget is on an inactive layer,
        // activate all parent layers so it's visible
        dojo.forEach(this.selected, function(w) {
            if (wm.isInstanceType(w, [wm.Control,wm.DojoLightbox])) {
                while (w) {
                    wm.fire(w, "activate");
                    w = w.parent;
                }
            }
        });
    },
    selectParent: function() {
        // Ignore calls to selectParent if a Combobox is open; typically the user hits escape to close
        // the combobox and not to select the parent widget
        var comboboxDropdown = dojo.query(".dijitComboBoxMenuPopup")[0];
        if (comboboxDropdown && comboboxDropdown.style.display != "none") {
            var e = dijit.byId(dojo.attr(comboboxDropdown,"dijitpopupparent"));
            if (e) e.closeDropDown();
            return;
        }

        if (this.targetMode)
            this.selectProperty()
        else
            this.designer.selectParent();
    },
        treeSearchChange: function(inSender) {
        var newval = this.treeSearch.getDataValue();
        this.refreshVisualTree(newval);
    },
        compTreeSearchChange: function(inSender) {
        var newval = this.compTreeSearch.getDataValue();
        this.refreshServiceTree(newval);
        this.refreshComponentTree(newval);
    },
    resetTreeSearch: function() {
        this.treeSearch.setDataValue("");
    },
    resetCompTreeSearch: function() {
        this.compTreeSearch.setDataValue("");
    },
        paletteSearchChange: function(inSender) {
        var newval = this.paletteSearch.getDataValue();
        this.palette.filterNodes(new RegExp(newval ? newval.toLowerCase() : ""));
    },
    resetPaletteSearch: function() {
        this.paletteSearch.setDataValue("");
    },
        projectsSearchChange: function(inSender) {
        var newval = this.projectsSearch.getDataValue() || "";
        var regex = new RegExp(newval.toLowerCase());
        var projectNodes = this.projectsTree.root.kids;
        for (var i = 0; i <  projectNodes.length; i++) {
        projectNodes[i].domNode.style.display =  (projectNodes[i].content.toLowerCase().match(regex)) ? "block" : "none";
        }
    },
    resetProjectsSearch: function() {
        this.projectsSearch.setDataValue("");
    },

        keyboardShortcutsDialog: function() {
        var shortcuts = [
        {d: this.getDictionaryItem("SHORTCUTS_HEADER")},
                 {l: "C-w", d: this.getDictionaryItem("SHORTCUTS_W")},
                 {l: "C-h", d: this.getDictionaryItem("SHORTCUTS_H")},
                 {l: "C-m", d: this.getDictionaryItem("SHORTCUTS_M")},
                 {l: "C-s", d: this.getDictionaryItem("SHORTCUTS_S")},
                 {l: "C-r", d: this.getDictionaryItem("SHORTCUTS_R")},
                 {l: "C-f", d: this.getDictionaryItem("SHORTCUTS_F")},
                 {l: "ESC", d: this.getDictionaryItem("SHORTCUTS_ESC_1")},
                 {l: "ESC", d: this.getDictionaryItem("SHORTCUTS_ESC_2")},
                 {l: "DEL", d: this.getDictionaryItem("SHORTCUTS_DEL")},

                     {d: this.getDictionaryItem("SHORTCUTS_HEADER_2")},
                 {l: "C-o", d: this.getDictionaryItem("SHORTCUTS_O")},
                 {l: "C-e", d: this.getDictionaryItem("SHORTCUTS_E")},
                 {l: "C-b", d: this.getDictionaryItem("SHORTCUTS_B")},
                     {l: "C-z", d: this.getDictionaryItem("SHORTCUTS_Z")}];

        var html = "<table>";
        for (var i = 0; i < shortcuts.length; i++) {
        if (!shortcuts[i].l) {
            html += "<tr><td colspan='2'><b>" + shortcuts[i].d + "</td></tr>\n";
        } else {
            html += "<tr><td style='white-space: nowrap;'>" + shortcuts[i].l + "</td><td>" + shortcuts[i].d + "</td></tr>\n";
        }
        }
        html += "</table>";
        html = "<div class='KeyboardShortcutDialog'>" + html + "</div>";
        this.helpDialog.setUserPrompt(html);
        this.helpDialog.button1.addUserClass("StudioButton")
        this.helpDialog.show();

    },
    componentRenamed: function(inOld, inNew, inComponent) {
        this.renameComponentOnTree.apply(this, arguments);
            this.setInspectedCaption(inComponent);
        this.cssChanged();
    },
    //=========================================================================
    // UI
    //=========================================================================
    waitForDeferred: function(inDeferred, inMsg) {
        this.beginWait(inMsg);
        inDeferred.addBoth(dojo.hitch(this, function(inResult) {
            this.endWait(inMsg);
            return inResult;
        }));
    },
    waitForCallback: function(inMsg, inCallback) {
        studio.beginWait(inMsg);
        wm.onidle(function() {
            try {
                inCallback();
            }
            catch(e){
                console.info('error while waitForCallback: ', e);
            }

            studio.endWait(inMsg);
        });
    },
        waitMsg: null,
    beginWait: function(inMsg, inNoThrobber) {
            if (!this.waitMsg) this.waitMsg = {};
        if (!inMsg)
            return;
        this.dialog.setWidth("242px");
        this.dialog.setHeight("115px");
        this.dialog.containerNode.innerHTML = [
            '<table class="wmWaitDialog"><tr><td>',
                inNoThrobber ? '' : '<div class="wmWaitThrobber">&nbsp;</div>',
                '<div class="wmWaitMessage">',
            inMsg,//inMsg || this.getDictionaryItem("DIALOG_WAIT_MESSAGE"),
                '</div>',
                '<br />',
            '</td></tr></table>',
        ''].join('');
        this.dialog.setShowing(true);
                this.waitMsg[inMsg] = 1;
    },
    endWait: function(optionalMsg) {
            if (optionalMsg)
                   delete this.waitMsg[optionalMsg];
                else
                   this.waitMsg = {};

                var firstMsg = "";
                for (var msg in this.waitMsg) {
                   firstMsg = msg;
                   break;
                }
            if (firstMsg)
           this.beginWait(firstMsg);
                else
           this.dialog.setShowing(false);
    },
    addStudioClass: function(inClass) {
        var n = this.designer.domNode;
                /* This is just terribly wrong.... what does it mean?  MK */
        if (dojo.hasClass(n, inClass))
            dojo.addClass(n, inClass);
    },
    removeStudioClass: function(inClass) {
        dojo.removeClass(this.designer.domNode, inClass);
    },
    toggleStudioClass: function(inClass) {
        var n = this.designer.domNode;
        dojo[dojo.hasClass(n, inClass) ? "removeClass" : "addClass"](n, inClass);
    },
    statusMsg: "",
    setStatusMsg: function(inMsg) {
        this.statusMsg = inMsg;
        this.updateStatus();
    },
    updateStatus: function() {
        return;
        var s = this.selected[0], m = [s ? s.name : '(no selection)'];
        if (s && s instanceof wm.Widget) {
            var b = s.getBounds();
            m.push(Math.round(b.w) + ' x ' + Math.round(b.h));
        }
        var h = [
            '<table cellspacing="0" style="height: 100%; width: 100%; text-align: center;"><tr>',
            '<td class="statusNameBox" style="font-weight: bold; width:14em; border-right: 1px solid silver; padding: 2px;">',
                m[0],
            '</td>',
            '<td class="statusSizeBox"  style="width:8em; border-right: 1px solid silver; padding: 2px;">',
                m[1],
            '</td>',
            '<td class="statusMsgBox" style="padding: 2px;">',
                this.statusMsg,
            '</td>',
            '<td class="statusLoadingBox" style="width: 32px; border-left: 1px solid silver; padding: 2px">',
                    wm.inflight.getCount() ? '<img src="images/loadingThrobber.gif"/>' : '&nbsp;',
            '</td>',
            '</tr></table>'].join('');
        if (this._lastStatus != h) {
            this.status.domNode.innerHTML = h;
            this._lastStatus = h;
        }
    },
    isShowingWorkspace: function() {
        return (this.tabs.getLayer().name == "workspace");
    },
    //=========================================================================
    // Events
    //=========================================================================
    allowKeyTarget: function(e) {
        // prevent trapping keypress in native key-aware controls
        var ctrls = { "INPUT": 1, "TEXTAREA": 1 };
        var t = e.target;
        while (t) {
            if (ctrls[t.tagName])
                return true;
            t = t.parentNode;
        }
        return false;
    },
    processKey: function(inCode, inMap, inCanProcess) {
        for (var i = 0, k; (k = inMap[i]); i++) {
            if (k.key == inCode && (inCanProcess || k.always)) {
                if (this[k.action]) {
                    if (k.idleDelay)
                        wm.onidle(this, k.action);
                    else
                        this[k.action]();
                }
                return true;
            }
        }
    },
    keydown: function(e) {
        // return if there are any showing dialogs owned by StudioApplication; dialogs intercept ESC and other keyboard
        // events using their own event handlers
        if(dojo.some(wm.dialog.showingList, dojo.hitch(this, function(dialog) {
            return dialog.getOwnerApp() == this.owner.owner && (dialog.modal || e.keyCode === dojo.keys.ESCAPE && dojo.isDescendant(document.activeElement, dialog.domNode));
        }))) return true;

        if(e._wmstop) return true;


        // only act on CTRL keys (but not SHIFT-CTRL); accepts command/alt as alternative to ctrl key.
        var ctrlKey = e.ctrlKey || e.metaKey;
        var hotkey = (ctrlKey && !(ctrlKey && e.shiftKey));
        var kc = e.keyCode,
            isEsc = kc == dojo.keys.ESCAPE,
            chr = String.fromCharCode(kc),
            normalKey = !isEsc && ((!this.studioKeyPriority && this.allowKeyTarget(e)) || !this.isShowingWorkspace() || wm.dialog.showing),
            handled = false;
        if(e.metaKey && chr.toLowerCase() == "r") return false; // don't block reload commands
        // hotkey
        if(hotkey) handled = this.processKey(chr, wm.studioConfig.hotkeyMap, !normalKey);

        // if its not a hotkey, and the target is a text or password field, let the browser handle it
        if(!hotkey && !isEsc) {
            if(e.target && e.target.nodeName.toLowerCase() == "input" && (dojo.attr(e.target, "type") == "text" || dojo.attr(e.target, "type") == "password") || e.target && e.target.nodeName.toLowerCase() == "textarea") return;
        }

        // key codes
        if(!handled) handled = this.processKey(kc, wm.studioConfig.hotkeyCodeMap, !normalKey);
        // if we've handled the key, stop the event
        if(handled) dojo.stopEvent(e);
    },
    // Support keypress event that should do nothing and NOT bubble up to the window level
    nullAction: function() {;
    },
    /*topLayersChange: function(inSender) {
        if (inSender.getLayerCaption() == "Welcome")
            wm.fire(this.welcomePane.page, "update");
    },*/
    tabsCanChange: function(inSender, inChangeInfo) {
        if (!studio.application) return true; // needed to show the resource manager when the application has failed to load
        var newLayer = inSender.layers[inChangeInfo.newIndex];
        if (!newLayer) return;
        if (this.tabs.getActiveLayer() && this.tabs.getActiveLayer().name == "sourceTab") {
        setTimeout(dojo.hitch(this, function() {
            this.cssChanged();
            this.markupChanged();
        }), 100);
        }
        switch (newLayer.name) {
        case "sourceTab":
        this.generateAppSourceHtml();
        break;
        }
    },
    generateAppSourceHtml: function() {
        this.widgetsHtml.setHtml('<pre style="padding: 0; width: 100%; height: 100%;">' + this.getWidgets() + "</pre>");
        var appsrc = this.project.generateApplicationSource();
        var match = appsrc.split(terminus)

        appsrc = (match) ? match[0] + "\n\t" + terminus + "\n});" : appsrc;
        this.appsourceHtml.setHtml('<pre style="padding: 0; width: 100%; height: 100%;">' + appsrc + "</pre>");
    },
    tabsChange: function(inSender) {
        if (!studio.page) return;

        switch (inSender.name) {
        case "sourceTab":
            this.designer.showHideHandles(false);
            this.sourceTabsChange(this.sourceTabs);
            break;
        case "workspace":
            this.designer.showHideHandles(true);
            // re-inspect when we show designer
            if (this.selected.length) {
                // selected object may have changed; example:
                // in liveview, I hit delete, now live view is no longer selected AND
                // we change tabs going back to the canvas.
                if (wm.Array.equals(this.selected, this.inspector.inspected)) {
                    this.inspector.reinspect();
                } else {
                    this.inspector.inspect(this.selected);
                }
            }
            break;
        }
    },
    leftTabsChange: function(inSender) {
        var layer = inSender.getActiveLayer();

        /* If the user goes to the palette, switch layers to the design/canvas layer */
        if (layer.name == "mlpal" && this.page)
        this.navGotoDesignerClick();
    },

    sourceTabsCanChange: function(inSender, inChangeInfo) {
    },
    sourceTabsChange: function(inSender) {
        if (!studio.application) return; // needed to show the resource manager when the application has failed to load
        var layer = inSender.getActiveLayer();

            // darksnazzy messes with users ability to edit themes
            dojo[(layer.name == "themeLayer") ? "removeClass" : "addClass"](this.sourceTab.domNode, "wm-darksnazzy");
        if (layer.name == "appDocs") {
        this.generateAllDocumentation();
        }

    },

        generateAllDocumentation: function() {

        var html = this.getDictionaryItem("GENERATE_DOCUMENTATION_HEADER");
        var c;

        html += "<h2>App " + studio.application.name + "</h2>";
        for (c in studio.application.components) {
        var comp = studio.application.components[c];
        if (comp.documentation || comp instanceof wm.Control == false)
            html += "<hr/><h3>" + comp.name + " (" + comp.declaredClass + ")</h3><div style='padding-left: 15px'>" + (comp.documentation || this.getDictionaryItem("GENERATE_DOCUMENTATION_NODOCS")) + "</div>";
        }


        html += "<h2>" + this.getDictionaryItem("GENERATE_DOCUMENTATION_NONVISUAL_HEADER", {pageName: studio.project.pageName}) + "</h2>"
        for (c in studio.page.components) {
        var comp = studio.page.components[c];
        if (comp.documentation || comp instanceof wm.Control == false)
        html += "<hr/><h3>" + comp.name + " (" + comp.declaredClass + ")</h3><div style='padding-left: 15px'>" + (comp.documentation || this.getDictionaryItem("GENERATE_DOCUMENTATION_NODOCS")) + "</div>";
        }

        html += "<h2>" + this.getDictionaryItem("GENERATE_DOCUMENTATION_VISUAL_HEADER", {pageName: studio.project.pageName}) + "</h2>";
        var widgets = wm.listOfWidgetType(wm.Control, false, true);
        for (var i = 0; i < widgets.length; i++) {
        var comp = widgets[i];
        if (comp.documentation)
            html += "<hr/><h3>" + comp.name + " (" + comp.declaredClass + ")</h3><div style='padding-left: 15px'>" + comp.documentation  + "</div>";
        }
        this.appDocViewer.setHtml(html);
    },
    printAppDocsClick: function(inSender) {
        var win = window.open("", "APIPrintout", "width=800,height=500");
        var doc = win.document.open("text/html");
        doc.write(this.appDocViewer.html);
        doc.write("<script>window.setTimeout(function() {window.print();}, 100);</script>");
        doc.close();
    },

    treeSelect: function(inSender, inNode, addToSelection) {
        var selected = [];
        if (inSender.multiSelect) {
            dojo.forEach(inSender.selected, function(c) {selected.push(c);});
            if (inSender.multiSelect && addToSelection) {
                dojo.forEach(inSender == this.widgetsTree ? this.compTree.selected : this.widgetsTree.selected, function(c) {selected.push(c);});
            }
        } else {
            selected = [inSender.selected];
        }


        if (selected.length) {
            this.treeNodeSelect(selected);
        }
        //this.select(inNode.component);
    },
    inflightChange: function() {
        this.updateStatus();
        if (wm.inflight.getCount())
        this.setStatusMsg(this.getDictionaryItem("JSON_PENDING", {name: wm.Array.last(wm.inflight._inflightNames)}));
        else
        this.setStatusMsg("");
        //this.setStatusMsg("Pending Requests: " + wm.inflight.getCount());
    },
    //=========================================================================
    // Clicks
    //=========================================================================
    toggleControlSize: function(inControl, inDimension) {
            if (!inControl.canResize(inDimension)) return;
/*
        var useDimension = inDimension;
        if (this.currentDeviceType != "desktop" && this.page.enableMobileHeight && inDimension == "height") {
        useDimension = "mobileHeight";
        }
        */
        new wm.PropTask(inControl, inDimension, inControl[inDimension]);
        var d = String(inControl.getProp(inDimension));
            if (d.indexOf("%") >= 0) {
                d = Math.max(parseInt(d), inControl["getMin" + wm.capitalize(inDimension) + "Prop"]()) + "px";
            } else {
                d = "100%";
            }
        inControl.setProp(inDimension, d);
    },
    toggleControlPosition: function(inControl, inProp, inValues) {
        var
            v = inControl.getValue(inProp),
            i = (dojo.indexOf(inValues, v)+1) % inValues.length;
        inControl.setValue(inProp, inValues[i]);
    },
    toggleWidthClick: function() {
        var changed = false;
        dojo.forEach(this.selected, function(s) {
            if (s) {
                if (s.fitToContentWidth) {
                    s.setFitToContentWidth(false);
                }
                this.toggleControlSize(s, "width");
                changed = true;
            }
        },this);
        if (changed) this.inspector.reinspect();
    },
    toggleHeightClick: function() {
        var changed = false;
        dojo.forEach(this.selected, function(s) {

            if (s) {
                if (s.fitToContentHeight) {
                    s.setFitToContentHeight(false);
                }
                this.toggleControlSize(s, "height");
                changed = true;
            }
        },this);
        if (changed) this.inspector.reinspect();

    },
    fitToContainerContentClick: function() {
        dojo.forEach(this.selected, function(s) {
            if (s && s instanceof wm.Container) {
                s.resizeToFit();
            }
        },this);
    },
    toggleVerticalAlignClick: function() {
        var changed = false;
        dojo.forEach(this.selected, function(s) {

            if (s) {
                new wm.PropTask(s, "verticalAlign", s.verticalAlign);
                this.toggleControlPosition(s, "verticalAlign", ["top", "middle", "bottom"]);
                changed = true;
            }
        },this);
        if (changed) this.inspector.reinspect();
    },
    toggleHorizontalAlignClick: function() {
        var changed = false;
        dojo.forEach(this.selected, function(s) {
            if (s) {
                new wm.PropTask(s, "horizontalAlign", s.horizontalAlign);
                this.toggleControlPosition(s, "horizontalAlign", ["left", "center", "right"]);
                changed = true;
            }
        },this);
        if (changed) this.inspector.reinspect();

    },
    toggleLayoutClick: function() {
        var changed = false;
        dojo.forEach(this.selected, function(s) {
            if (s) {
                var v = "top-to-bottom",
                    h = "left-to-right";
                new wm.PropTask(s, "layoutKind", s.layoutKind);
                s.setLayoutKind(s.layoutKind == v ? h : v);
                changed = true;
            }
        },this);
        if (changed) this.inspector.reinspect();

    },
    outlinedClick: function() {
        this.removeStudioClass(this._explodeClass);
        this.toggleStudioClass(this._outlineClass);

        var on = dojo.hasClass(this.designer.domNode, this._outlineClass);
        this.useDesignBorder = on;
        if (studio.page) {
            wm.forEachWidget(studio.page.root, function(w) {
                if (w.owner == studio.page) {
                    //w.designWrapper.setBorder(on ? "1" : "0");
                                w.getDesignBorder();
                                w.calcPadBorderMargin();
                                w.invalidCss = true;
                                w.renderCss();
                            }
            });
            wm.forEachProperty(studio.page.$, function(d) {
            	if (d instanceof wm.Dialog) {
		            wm.forEachWidget(d, function(w) {
		                if (w.owner == studio.page) {
		                    //w.designWrapper.setBorder(on ? "1" : "0");
                            w.getDesignBorder();
                            w.calcPadBorderMargin();
                            w.invalidCss = true;
                            w.renderCss();
                        }
	                });
				}
            });
        }
        wm.fire(this.page, "reflow");

    },
    explodedClick: function() {
        this.addStudioClass(this._outlineClass);
        this.toggleStudioClass(this._explodeClass);
        this.reflow();
        // update user setting
        this.setUserSettings({ explode: dojo.hasClass(this.designer.domNode, this._explodeClass) });
    },
    // a UI action concept would be handy for all this stuff
    updateCutPasteUi: function() {
        var
            klass = this.clipboardClass,
        //needsLayer = (klass == "wm.Layer"),
            disabled = !this.clipboard;
/* we used to require a layer only be pasted into wm.Layers; no more.  No we replace the layer with a panel at need
        if (!disabled && needsLayer) {
        var rp = dojo.getObject(wm.getClassProp(klass, "_requiredParent"));
        disabled = rp && !(this.selected instanceof rp);
        }
        */
        this.pasteBtn.setDisabled(disabled);
    },
    copyClick: function() {
        if (!this.copyBtn.disabled)
            this.copyControl();
    },
    cutClick: function() {
        if (!this.cutBtn.disabled)
            this.cutControl();
    },
    pasteClick: function() {
        if (!this.pasteBtn.disabled)
            this.pasteControl();
    },
    deleteClick: function() {
        if (!this.deleteBtn.disabled)
            this.deleteControl();
    },
    undoClick: function() {
        wm.undo.pop();
    },

    newComponentButtonClick: function(inSender) {
        var t = inSender.componentType;
        if (t) {
            var c = this.make(t);
            wm.fire(this.selected[0], "showConfigureDialog");
            return c;
        }
    },
/*
    componentsTreeDblClick: function(inSender, inNode) {
        var c = inNode.component;
        if (c.showConfigureDialog)
            c.showConfigureDialog();
    },
    deleteComponentButtonClick: function() {
        var s = this.componentsTree.selected;
        if (s && s.component)
            this.deleteControl(s.component);
    },
    */
    linkButtonClick: function(inSender, inData) {
        if (inData.openLink)
            wm.openUrl(inSender.openLink, inSender.openLinkTitle);
    },

    /* Theme toolbar buttons */
    saveThemeClick: function(inSender) {
    this.themesPage.page.saveTheme(inSender);
    },
    addNewThemeClick: function(inSender) {
    this.themesPage.page.copyThemeClick(inSender, "wm.base.widget.themes.wm_default");
    },
    copyThemeClick: function(inSender) {
    this.themesPage.page.copyThemeClick(inSender);
    },
    deleteThemeClick: function(inSender) {
    this.themesPage.page.removeThemeClick(inSender);
    },
    revertThemeClick: function(inSender) {
    this.themesPage.page.revertTheme();
    },
    devicesToggleClick: function(inSender){
    if (inSender.clicked) {
        app.warnOnce("mobileBetaWarn", "Please note that design for tablet and phone is in beta.  We encourage users to send feedback and suggestions on the forums.  But we do not gaurentee that this functionality is complete, and we may in the future choose to follow a different strategy and use different tools.");
    }
    },
    deviceSizeSelectChanged: function(inSender, inDisplayValue, inDataValue, inSetByCode) {
    if (!this.panel2.docked)
        this.panel2.setDocked(true);
    if (!this.PIContents.docked)
        this.PIContents.setDocked(true);
    inDataValue = this.deviceSizeSelect.getDataValue(); // other things call this method; inSender/inDataValue are not usable
    if (!inDataValue) {
        inDataValue = this.deviceSizeVar.getItem(0).getData();
    }
    var invert = wm.deviceType != "desktop" && this.landscapeToggleButton.clicked;
    this.designer.setWidth(invert ? inDataValue.height : inDataValue.width)
    this.designer.setHeight(invert ? inDataValue.width : inDataValue.height);
/*
    if (requestedCanvasWidth) {
        if (requestedCanvasWidth == "100%") {
        this.designer.setMargin("0");
        this.designer.setWidth("100%");
        } else if  (requestedCanvasWidth >= this.designer.bounds.w) {
        this.designer.setMargin("0");
        } else {
        var margin = Math.floor((this.designer.bounds.w - requestedCanvasWidth)/2);
        this.designer.setMargin("0," + margin + ",0," + margin);
        }
        this.designer.reflow();

    }
  */
    if (!inSetByCode) {
        dojo.publish("deviceSizeRecalc");
    }
    },
/*
    deviceTypeSelectChanged: function(inSender) {
    dojo.publish("deviceSizeRecalc");
    },
    */
    regenerateOrUpdateWidgetsForDevice: function() {
        studio.page._loadingPage = true;
        var regenerated = false;
        var panels = [studio.page.root];
        var showingDialogs = [];
        wm.forEachProperty(studio.page.$, function(inComponent) {
            if (inComponent instanceof wm.DesignableDialog) {
                if (inComponent.containerWidget) panels.push(inComponent.containerWidget);
                if (inComponent.buttonBar) panels.push(inComponent.buttonBar);
            }
            if (inComponent instanceof wm.Dialog) {
                if (inComponent.showing) showingDialogs.push(inComponent);
                if (inComponent.buttonBar) inComponent.buttonBar.resetDesignHeight();
                if (inComponent.titleBar) inComponent.titleBar.resetDesignHeight();
            }
        });
        wm.forEachProperty(studio.application.$, function(inComponent) {
            if (inComponent.containerWidget) panels.push(inComponent.containerWidget);
            if (inComponent.buttonBar) panels.push(inComponent.buttonBar);
            if (inComponent instanceof wm.Dialog) {
                if (inComponent.showing) showingDialogs.push(inComponent);
                if (inComponent.buttonBar) inComponent.buttonBar.resetDesignHeight();
                if (inComponent.titleBar) inComponent.titleBar.resetDesignHeight();
            }
        });
        var self = this;
        dojo.forEach(panels, function(panel) {

            wm.forEachWidget(panel, function(w) {
                var selected = studio.selected === w;
                if (w._regenerateOnDeviceChange && w.getParentPage() == studio.page && !w.owner.isAncestorInstanceOf(wm.Composite)) {
                    w = self.regenerateOnDeviceChange(w);
                    regenerated = true;
                    if (selected) studio.select(w);
                }
                w.resetDesignHeight();
            }, false);
            if (panel.parent && panel.parent instanceof wm.Dialog) panel.parent.reflow();
        });
        dojo.forEach(showingDialogs, function(w) {
            wm.onidle(this, function() {
                w.renderBounds();
                w.reflow();
            });
        });

        studio.page._loadingPage = false;
        return regenerated;
    },
    designDesktopUI: function() {
        this.currentDeviceType = "desktop";
        if (studio.application && studio.application.theme != studio.application._theme) {
            studio.application._setTheme(studio.application.theme);
        }

        this.widgetsTree.dragEnabled = true;
        if (studio.page && studio.page.root._mobileFolded) {
            studio.page.root.unfoldUI();
            studio.page.root.reflow();
            studio.refreshDesignTrees();
        }
        this.deviceSizeVar.setQuery({
            deviceType: "desktop"
        });
        this.deviceSizeSelect.setDataValue(this.deviceSizeVar.queriedItems.getItem(0).getData());
        this.orientationTogglePanel.hide();
        this.deviceSizeSelectChanged();
        app.addHistory({});
        dojo.removeClass(this.designer.domNode, "wmmobile");
        if (studio.page) {
            var regenerated = this.regenerateOrUpdateWidgetsForDevice();
            if (regenerated) {
                this.refreshVisualTree();
                this.page.reflow();
            }
        }
        this.reinspect(); // some properties may change like height/minHeight
        if (this.page && this.page.root) this.page.root.domNode.style.overflowX = "auto"
    },
    designTabletUI: function() {
        this.currentDeviceType = "tablet";
        if (studio.application && (studio.application.tabletTheme && studio.application.tabletTheme != studio.application._theme ||
            !studio.application.tabletTheme && studio.application._theme != studio.application.theme)) {
            studio.application._setTheme(studio.application.tabletTheme || studio.application.theme);
        }
        this.widgetsTree.dragEnabled = true;
        if (studio.page && studio.page.root._mobileFolded) {
            studio.page.root.unfoldUI();
            studio.page.root.reflow();
            studio.refreshDesignTrees();
        }

        this.deviceSizeVar.setQuery({
            deviceType: "tablet"
        });
        this.deviceSizeSelect.setDataValue(this.deviceSizeVar.queriedItems.getItem(0).getData());
        this.orientationTogglePanel.show();
        this.deviceSizeSelectChanged();
        app.addHistory({});
        dojo.addClass(this.designer.domNode, "wmmobile");
        if (studio.page) {
            var self = this;
            var regenerated = this.regenerateOrUpdateWidgetsForDevice();
            if (regenerated) {
                this.refreshVisualTree();
                this.page.reflow();
            }
        }
        this.reinspect(); // some properties may change like height/minHeight
        if (this.page && this.page.root) this.page.root.domNode.style.overflowX = "hidden"
    },
    designPhoneUIClick: function(inSender) {
        this.designPhoneUI(false);
    },
    designPhoneUI: function(inMobileFolding) {
        this.currentDeviceType = "phone";
        if (studio.application && (studio.application.phoneTheme && studio.application.phoneTheme != studio.application._theme ||
            !studio.application.phoneTheme && studio.application._theme != studio.application.theme)) {
            studio.application._setTheme(studio.application.phoneTheme || studio.application.theme);
        }

        this.widgetsTree.dragEnabled = true;
        if (studio.page && studio.page.root._mobileFolded && !inMobileFolding) {
            studio.page.root.unfoldUI();
            studio.page.root.reflow();
            studio.refreshDesignTrees();
        }

        this.deviceSizeVar.setQuery({
            deviceType: "phone"
        });
        this.deviceSizeSelect.setDataValue(this.deviceSizeVar.queriedItems.getItem(0).getData());
        this.orientationTogglePanel.show();
        this.deviceSizeSelectChanged();
        app.addHistory({});
        dojo.addClass(this.designer.domNode, "wmmobile");
        if (studio.page) {
            var self = this;
            var regenerated = this.regenerateOrUpdateWidgetsForDevice();

            if (regenerated) {
                this.refreshVisualTree();
                this.page.reflow();
            }
        }
        this.reinspect(); // some properties may change like height/minHeight
        if (this.page && this.page.root) this.page.root.domNode.style.overflowX = "hidden"
    },
    designMobileFoldingClick: function(inSender) {
       this.designMobileFolding(false);
   },
   designMobileFolding: function(inSkipWarning) {
       if (studio.page) {
           this.designPhoneUI(true);
           this.widgetsTree.dragEnabled = false;
           studio.page.root.foldUI();
           //studio.page.root.unfoldUI();
           studio.page.root.reflow();
           studio.refreshDesignTrees();
           if (inSkipWarning !== true) {
               app.warnOnce("mobileFoldingWarning", "Mobile Folding is a powerful but complicated feature which is in beta, and may not be supported in the future.  While in Mobile Folding view, you can not <li>Move widgets</li><li>Edit any layer objects that are generated</li></ol>You must leave the Mobile Folding view to perform these actions.");
           }

       }
   },
   regenerateOnDeviceChange: function(w) {
       var json = "{" + w.write("") + "}";
       var owner = w.owner;
       var parent = w.parent;
       var index = w.getIndexInParent();
       w.destroy();
       w = parent.createComponents(dojo.fromJson(json), owner)[0];
       w.setIndexInParent(index);
       return w;
   },
    languageSelectChanged: function(inSender, optionalPageName) {
        if (this._changingLanguage) return;
        var lastValue = this.languageSelect._lastValue;
        var newValue = this.languageSelect.getDisplayValue();
        if (lastValue == newValue) return;

        this.confirmSaveDialog.page.setup("", /* User clicks save */
        dojo.hitch(this, function() {
            this._saveConnect = dojo.connect(this, "saveProjectSuccess", this, function() {
                delete this._designLanguage;
                this.languageSelectChanged2();
                dojo.disconnect(this._saveConnect);
            });
            this._designLanguage = lastValue;
            this.saveAll(studio.project);
        }),

        /* User clicks dont save */
        dojo.hitch(this, "languageSelectChanged2"),

        /* User clicks cancel */
        dojo.hitch(this, function() {
            delete this._designLanguage;
            this._changingLanguage = true;
            this.languageSelect.setDisplayValue(lastValue);
            this._changingLanguage = false;
        }),


        /* If project isn't dirty, just run don't save callback */
        !this.updateProjectDirty());
/*

        app.confirm(this.getDictionaryItem("CONFIRM_SAVE_LANGUAGE"), false,
            dojo.hitch(this, function() {
                this._saveConnect = dojo.connect(this,"saveProjectSuccess", this, function() {
                delete this._designLanguage;
                    this.languageSelectChanged2();
                dojo.disconnect(this._saveConnect);
                });
                this._designLanguage = lastValue;
                this.saveAll(studio.project);
            }),
            dojo.hitch(this, function() {
                delete this._designLanguage;
                this._changingLanguage = true;
                this.languageSelect.setDisplayValue(lastValue);
                this._changingLanguage = false;
            }));
            */

    },
    languageSelectChanged2: function() {
        this.languageSelect.clearDirty();
        var lang = this.languageSelect.getDisplayValue();
        if (lang == "other") {
            app.prompt("Enter code", "", function(inResult) {
                var options = studio.languageSelect.options.split(/,/);
                options[options.length - 1] = inResult;
                options.push("other");
                studio.languageSelect.setOptions(options.join(","));
                studio.languageSelect.setDisplayValue(inResult);
            }, function() {
                studio.languageSelect.setDisplayValue("default");
            });
            return;
        }
        if (lang != "default") {
            var data = wm.load("projects/" + studio.project.projectName + "/language/nls/" + lang + "/" + studio.project.pageName + ".js");
            try {
                data = dojo.fromJson(data);
                this.page.installDesignDictionary(data);
            } catch (e) {
                console.error("Failed to load dictionary " + lang + "/" + studio.project.pageName);
            }
        } else {
            this.page.installDesignDictionary({});
        }
        this.setCleanPage();
        studio.inspector.reinspect();
    },
    pageSelectChanged: function(inSender, optionalPageName, inDataValue, inSetByCode) {

        if (!studio.page || this.disabledPageSelectChanged || inSetByCode) return;
        var page = optionalPageName || inSender.getDataValue();
        if (page == this.project.pageName || !page) return;

        var warnPage = this.getDictionaryItem("CONFIRM_OPEN_PAGE", {
            newPage: page,
            oldPage: this.project.pageName
        });
        this.confirmPageChange(warnPage, page, dojo.hitch(this, function(noChanges) {
            this.waitForCallback(this.getDictionaryItem("WAIT_OPENING_PAGE", {
                pageName: page
            }), dojo.hitch(this.project, "openPage", page, !noChanges));
        }), dojo.hitch(this, function() {
            this.disabledPageSelectChanged = true;
            this.pageSelect.setDataValue(studio.project.pageName);
            this.disabledPageSelectChanged = false;
        }));
        //this.project.openPage(pagename);
    },

    selectProperty: function(inSender, info, text) {
        console.log("selectProperty");
        var n = this._testn;
        if (this.targetMode) {
            n.style.display = "none";
            this.targetMode = false;
            this.inspector.setSelectMode(false);
            dojo.disconnect(this._testc);
        } else {
            this._bindTarget = inSender;
            if (!n) {
                n = this._testn = document.createElement("div");
                n.innerHTML = text; //"select target";
                n.style.cssText = "background-color: lightgreen; border: 1px solid black; position: absolute; padding: 4px;";
                document.body.appendChild(n);
            }
            n.style.display = "";
            this._testc = dojo.connect(document.body, "onmousemove", this, function(e) {
                n.style.left = e.pageX + 16 + "px";
                n.style.top = e.pageY + 16 + "px";
            });
            this.inspector.setSelectMode(true);
            this.targetMode = true;
        }
    },
    propertySelected: function(inId) {
        this.onSelectProperty(inId);
        // shuts down select mode
        this.selectProperty();
        // bindBind may have been performed by a different inspector
        this.select(this._bindTarget);
    },
    onSelectProperty: function(inId) {
    },
    //=========================================================================
    // Designer Events
    //=========================================================================
    designerSelect: function(inSender, selected) {
        if (selected.length) {
            this.select(selected);
        }
    },
    designerMove: function(inSender, inDragger) {
        //this.updateStatus();
        studio.refreshDesignTrees();
    },
    //=========================================================================
    // Cloud User Management
    //=========================================================================
    requestUserName: function() {
        studio.securityService.requestSync("getUserName", [], dojo.hitch(this, "requestUserNameSuccess"), dojo.hitch(this, "requestUserNameFailure"));
    },
        setUserName: function(inName) {
        this.userName = inName;
            this.userLabel.setCaption(this.userName);
        },
    requestUserNameSuccess: function(inResponse) {
        if (inResponse) {
            this.setUserName(inResponse);
            this.userLabel.setCaption(this.userName);
                }
    },
    requestUserNameFailure: function(inResponse) {
                this.getProjectDir("");
    },
        getUserName: function() {return this.userName;},
        editAccountClick: function(inSender) {
        app.pageDialog.showPage("UserSettings",true, 500,200);
        },
    logoutClick: function(inSender) {
        this.confirmAppChange(this.getDictionaryItem("CONFIRM_LOGOUT"), undefined,
                                  dojo.hitch(this, function() {
                              this._isLogout = true;
                              studio.securityService.requestSync("logout", [], dojo.hitch(this, "logoutSuccess"));
                                  }));
    },
    logoutSuccess: function(inResponse) {
        window.location.reload();
    },
/*
        saveDocumentation: function() {
        var html = this.documentationDialog.getHtml();
        this.documentationDialog.editComponent.documentation = html;
        if (this.documentationDialog.editComponent == studio.selected)
        this.inspector.reinspect();
        this.writeDocumentationMenuItem.set("checked",Boolean(studio.selected.documentation));
    },
    */
    loadThemeList: function(optionalCallback) {

        var d = studio.deploymentService.requestAsync("listThemes");
        var d2 = new dojo.Deferred();
        d.addCallback(dojo.hitch(this, function(inString) {
            var inData = dojo.fromJson(inString);
            var d = [];
            wm.forEachProperty(inData, function(inValue, inName) {
                if (inName != "wm_studio") {
                    var designer = inValue.designer;
                    var dojoPackage = inValue["package"];
                    d.push({name: inName,
                            dataValue: dojoPackage + "." + inName,
                            designer: designer});
                }
            });
            this.themesListVar.setData(d);
            d2.callback();
        }));
        if (optionalCallback)
            d.addCallback(optionalCallback);
        return d2;
    },
    loadHelp: function(inType, inPropName, onSuccess) {
    var version = wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/,"$1");
    var url = studio.getDictionaryItem("URL_PROPDOCS", {studioVersionNumber:  version});

    if (inType == studio.project.projectName) inType = "wm.Application";
    else if (inType == studio.project.pageName) inType = "wm.Page";

          inType = inType.substring(inType.indexOf(".")+1);

          if (inType.indexOf("gadget.") == 0)
          inType = inType.substring(inType.indexOf(".")+1);

          if (inType.indexOf("dijit.") == 0)
          inType = inType.substring(inType.indexOf(".")+1);


          inType = inType.replace(/\./g, "_");

    url = url + inType + (inPropName ? "_" + inPropName : "");;
    studio.studioService.requestAsync("getPropertyHelp", [url + "?synopsis"], onSuccess);
    return url;
    },
    startPageIFrameLoaded: function() {
    if (this.startPageDialog.page)
        this.startPageDialog.page.iframe.show();
    },
    menuBarHelpClick: function() {
    window.open(this.getDictionaryItem("URL_DOCS", {studioVersionNumber: wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/,"$1")}));
    },
/*
    mouseOverMenuBarHelp: function(inSender) {
    app.createToolTip("Click for documentation", this.menuBarHelp.domNode, null, "150px");
    },
    mouseOutMenuBarHelp: function(inSender) {
    app.hideToolTip();
    },
    */
    loadResourcesTab: function() {
    //this.resourcesPage.getComponent("resourceManager").loadResources();
    },

/*
    toggleInspectorDialog: function() {
    if (!this.PIContents) return;
    if (this.PIContents.parent == this.PIPanel) {
        this.PIContents.setParent(this.propertiesDialog.containerWidget);
        this.splitter3b.hide();
        this.PIPanel.hide();
        this.inspectorDialogToggle.hide();
        this.PIBotBorder.hide();
        this.propertiesDialog.titleClose.show();
        this.propertiesDialog.show();
    } else {
        this.propertiesDialog.hide();
        this.PIContents.setParent(this.PIPanel);
        this.inspectorDialogToggle.show();
        this.PIBotBorder.show();
        this.PIPanel.show();
        this.splitter3b.show();
        this.PIPanel.reflow();
    }
    for (var i = 0; i < wm.dialog.showingList.length; i++) {
        var d = wm.dialog.showingList[i];
        if (d._isDesignLoaded)
        d.reflow();
    }
    },

    togglePaletteDialog: function() {
    if (!this.left) return;
    if (this.left.parent == this.panel2) {
        this.paletteDialog.containerWidget.setPadding("0");
        this.left.setParent(this.paletteDialog.containerWidget);
        this.splitter1.hide();
        this.panel2.hide();
        this._paletteToDialogButton.style.display = "none";
        this.paletteDialog.titleClose.show();
        this.paletteDialog.show();
    } else {
        this.paletteDialog.hide();
        this.left.setParent(this.panel2);
        this._paletteToDialogButton.style.display = "";
        this.panel2.show();
        this.splitter1.show();
        this.panel2.reflow();
    }
    for (var i = 0; i < wm.dialog.showingList.length; i++) {
        var d = wm.dialog.showingList[i];
        if (d._isDesignLoaded)
        d.reflow();
    }
    },
    */
    uploadStudioPatches: function() {
        this.addPatchDialog.show();
    },


    dockPropertyPanel: function() {
        if (!this.PIContents.isDestroyed && !this.PIContents._destroying) {
            this.PIContents.setShowing(true);
            this.PIContents.setDocked(true,this.PIPanel);
        }
    },
    dockPalette: function() {
        if (!this.panel2.isDestroyed && !this.panel2._destroying) {
            this.panel2.setShowing(true);
            this.panel2.setDocked(true,this.dockLeftPanel);
        }
    },
    searchProperties: function(inSender,inDisplayValue,inDataValue) {
        this.inspector.propertySearch(inDisplayValue);
    },
    editPublishedProperties: function() {
        this.publishedPropsDialog.show();
        this.publishedPropsDialog.page.reset(this.selected[0]);
    },
    showDeviceBarHelp: function() {
        window.open(studio.getDictionaryItem("URL_DOCS", {studioVersionNumber: wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/,"$1")}) + "MobileDevelopment");
    },
    gridDesignerHelp: function() {
        window.open(studio.getDictionaryItem("URL_DOCS", {studioVersionNumber: wm.studioConfig.studioVersion.replace(/^(\d+\.\d+).*/,"$1")}) + "GridDesigner");
    },
    browserZoomed: function() {
        var isZoomed = Boolean(app._currentZoomLevel);
        this.editAreaZoomWarningLabel.setShowing(isZoomed);
        this.cssEditAreaZoomWarningLabel.setShowing(isZoomed);
        this.markupEditAreaZoomWarningLabel.setShowing(isZoomed);
        this.appsourceEditAreaZoomWarningLabel.setShowing(isZoomed);
    },
    showProjectDesignWarnings: function(inSender, inEvent) {

        var text = "The following errors were found in your project<ul>";
        this.warningsListVar.forEach(function(item) {
            text += "<li>" + item.getValue("name") + "</li>";
        });
        text += "</ul>";

        app.alert(text);
    }
});


// Inherits some properties via wm_studio/Theme.js
dojo.declare("wm.studio.DialogMainPanel", wm.Panel, {});
dojo.declare("wm.studio.DialogButtonPanel", wm.Panel, {
    _classes: {domNode: ["StudioDialogFooter"]},
    layoutKind: "left-to-right",
    horizontalAlign: "right",
    verticalAlign: "justified",
    height: "35px",
    width: "100%"
});
dojo.declare("wm.studio.ToolbarButton", wm.ToolButton, {
    _classes: {domNode: ["StudioToolbarButton"]},
    margin: "4",
    padding: "0,3,0,3",
    width: "30px",
    height: "100%"
});
dojo.declare("wm.studio.ToolbarSpacer", wm.Spacer, {
    _classes: {domNode: ["StudioToolbarSpacer"]},
    height: "24px",
    width: "12px",
    margin: "0,5"
});

/* Added this widget mostly because headerHeight was getting trampled by the user's theme in mid-rerendering of the tabs */
dojo.declare("wm.studio.TabLayers", wm.TabLayers, {
    headerHeight: "31px",
    "layersType": "Tabs",
    "margin": "0",
    "border": "0",
    "borderColor": "#959DAB",
    "clientBorder": "0",
    "clientBorderColor": "#959DAB",
    width: "100%",
    height: "100%"
});