/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 * with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 * OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 */

import React, { Component, RefObject } from "react";

import { AppContext } from "../../common";
import IdeaListView from "../../components/list-view";
import { TableProps } from "@cloudscape-design/components/table/interfaces";
import { User } from "../../client/data-model";
import { AccountsClient } from "../../client";
import Utils from "../../common/utils";
import IdeaConfirm from "../../components/modals";
import { Box, Button, FormField, Input, Modal, Select, SpaceBetween, StatusIndicator } from "@cloudscape-design/components";
import { IdeaSideNavigationProps } from "../../components/side-navigation";
import IdeaAppLayout, { IdeaAppLayoutProps } from "../../components/app-layout";
import { withRouter } from "../../navigation/navigation-utils";
import { Constants } from "../../common/constants";

export interface UsersProps extends IdeaAppLayoutProps, IdeaSideNavigationProps {}

export interface UsersState {
    userSelected: boolean;
    showCreateUserModal: boolean;
    showDeleteUserModal: boolean;
    createUserEmail: string;
    createUserRole: string;
    createUserLoading: boolean;
    deleteUserLoading: boolean;
}

const RES_SPECIFIC_NON_PROJECT_GROUPS = ["cluster-manager-administrators-module-group", "cluster-manager-users-module-group", "managers-cluster-group", "scheduler-administrators-module-group", "scheduler-users-module-group", "vdc-administrators-module-group", "vdc-users-module-group"];

export const USER_TABLE_COLUMN_DEFINITIONS: TableProps.ColumnDefinition<User>[] = [
    {
        id: "username",
        header: "Username",
        cell: (e) => e.username,
        sortingField: "username",
    },
    {
        id: "uid",
        header: "UID",
        cell: (e) => e.uid,
        sortingField: "uid",
    },
    {
        id: "gid",
        header: "GID",
        cell: (e) => e.gid,
        sortingField: "gid",
    },
    {
        id: "email",
        header: "Email",
        cell: (e) => e.email,
        sortingField: "email",
    },
    {
        id: "identity_source",
        header: "Identity Source",
        cell: (e) => e.identity_source === Constants.COGNITO_USER_IDP_TYPE ? "Cognito" : e.identity_source,
        sortingField: "identity_source",
    },
    {
        id: "sudo",
        header: "Is Sudo?",
        cell: (e) => (e.sudo ? "Yes" : "No"),
        sortingField: "sudo",
    },
    {
        id: "user_role",
        header: "Role",
        cell: (e) => e.role,
        sortingComparator: (a, b) => (a.role || '').localeCompare(b.role || '')
    },
    {
        id: "is_active",
        header: "Is Active",
        cell: (e) => (e.is_active ? "Yes" : "No"),
        sortingField: "is_active",
    },
    {
        id: "enabled",
        header: "Status",
        cell: (e) => (e.enabled ? <StatusIndicator type="success">Enabled</StatusIndicator> : <StatusIndicator type="stopped">Disabled</StatusIndicator>),
        sortingField: "enabled",
    },
    {
        id: "groups",
        header: "Groups",
        cell: (user) => {
            if (user.additional_groups) {
                return (
                    <div>
                        {user.additional_groups.map((group, index) => {
                            if (!RES_SPECIFIC_NON_PROJECT_GROUPS.includes(group) && group != `${user.username}-user-group`) {
                                return <li key={index}>{group}</li>;
                            }
                        })}
                    </div>
                );
            } else {
                return "-";
            }
        },
        sortingComparator: (a, b) => {
            const GroupsA = a.additional_groups || [];
            const GroupsB = b.additional_groups || [];
            if (GroupsA.length !== GroupsB.length) {
                return GroupsA.length - GroupsB.length;
            }
            return GroupsA.join(', ').localeCompare(GroupsB.join(', '));
        }
    },
    {
        id: "synced_on",
        header: "Synced On",
        cell: (e) => new Date(e.synced_on!).toLocaleString(),
        sortingField: "synced_on",
    },
];

class Users extends Component<UsersProps, UsersState> {
    toggleAdminUserConfirmModal: RefObject<IdeaConfirm>;
    toggleUserEnabledConfirmModal: RefObject<IdeaConfirm>;
    listing: RefObject<IdeaListView>;

    constructor(props: UsersProps) {
        super(props);
        this.toggleAdminUserConfirmModal = React.createRef();
        this.toggleUserEnabledConfirmModal = React.createRef();
        this.listing = React.createRef();
        this.state = {
            userSelected: false,
            showCreateUserModal: false,
            showDeleteUserModal: false,
            createUserEmail: "",
            createUserRole: "user",
            createUserLoading: false,
            deleteUserLoading: false,
        };
    }

    authAdmin(): AccountsClient {
        return AppContext.get().client().accounts();
    }

    getToggleAdminUserConfirmModal(): IdeaConfirm {
        return this.toggleAdminUserConfirmModal.current!;
    }

    getToggleUserEnabledConfirmModal(): IdeaConfirm {
        return this.toggleUserEnabledConfirmModal.current!;
    }

    getListing(): IdeaListView {
        return this.listing.current!;
    }

    buildToggleAdminUserConfirmModal() {
        let message;
        if (this.isSelectedUserAdmin()) {
            message = "Are you sure you want to revoke admin rights from: ";
        } else {
            message = "Are you sure you want to grant admin rights to: ";
        }
        return (
            <IdeaConfirm
                ref={this.toggleAdminUserConfirmModal}
                title={this.isSelectedUserAdmin() ? "Revoke Admin Rights" : "Grant Admin Rights"}
                onConfirm={() => {
                    const username = this.getSelectedUser()?.username;
                    if (this.isSelectedUserAdmin()) {
                        this.authAdmin()
                            .removeAdminUser({
                                username: username,
                            })
                            .then((_) => {
                                this.getListing().fetchRecords();
                                this.setFlashMessage(`Admin rights were revoked from User: ${username}.`, "success");
                            })
                            .catch((error) => {
                                this.setFlashMessage(`Failed to revoke admin rights: ${error.message}`, "error");
                            });
                    } else {
                        this.authAdmin()
                            .addAdminUser({
                                username: username,
                            })
                            .then((_) => {
                                this.getListing().fetchRecords();
                                this.setFlashMessage(`User: ${username} was successfully granted admin rights.`, "success");
                            })
                            .catch((error) => {
                                this.setFlashMessage(`Failed to grant admin rights: ${error.message}`, "error");
                            });
                    }
                }}
            >
                {message} <b>{this.getSelectedUser()?.username}</b> ?
            </IdeaConfirm>
        );
    }

    buildToggleUserEnabledConfirmModal() {
        let message;
        if (this.isSelectedUserEnabled()) {
            message = "Are you sure you want to disable user: ";
        } else {
            message = "Are you sure you want to enable user: ";
        }
        return (
            <IdeaConfirm
                ref={this.toggleUserEnabledConfirmModal}
                title={this.isSelectedUserEnabled() ? "Disable User" : "Enable User"}
                onConfirm={() => {
                    const username = this.getSelectedUser()?.username;
                    if (this.isSelectedUserEnabled()) {
                        this.authAdmin()
                            .disableUser({
                                username: username,
                            })
                            .then((_) => {
                                this.getListing().fetchRecords();
                                this.setFlashMessage(`User: ${username} disabled successfully.`, "success");
                            })
                            .catch((error) => {
                                this.setFlashMessage(`Failed to disable user: ${error.message}`, "error");
                            });
                    } else {
                        this.authAdmin()
                            .enableUser({
                                username: username,
                            })
                            .then((_) => {
                                this.getListing().fetchRecords();
                                this.setFlashMessage(`User: ${username} enabled successfully.`, "success");
                            })
                            .catch((error) => {
                                this.setFlashMessage(`Failed to enable user: ${error.message}`, "error");
                            });
                    }
                }}
            >
                {message} <b>{this.getSelectedUser()?.username}</b> ?
            </IdeaConfirm>
        );
    }

    setFlashMessage(message: string, type: "success" | "info" | "error") {
        this.props.onFlashbarChange({
            items: [
                {
                    content: message,
                    type: type,
                    dismissible: true,
                },
            ],
        });
    }

    isSelected(): boolean {
        return this.state.userSelected;
    }

    getSelectedUser(): User | null {
        if (this.getListing() == null) {
            return null;
        }
        return this.getListing().getSelectedItem<User>();
    }

    isSelectedUserAdmin(): boolean {
        if (!this.isSelected()) {
            return false;
        }
        const selectedUser = this.getSelectedUser();
        if (selectedUser == null) {
            return false;
        }
        return Utils.asString(selectedUser.role) == 'admin';
    }

    isSelectedUserEnabled(): boolean {
        if (!this.isSelected()) {
            return false;
        }
        const selectedUser = this.getSelectedUser();
        if (selectedUser == null) {
            return false;
        }
        return selectedUser.enabled!;
    }

    buildCreateUserModal() {
        return (
            <Modal
                visible={this.state.showCreateUserModal}
                onDismiss={() => this.setState({ showCreateUserModal: false })}
                header="Add User"
                footer={
                    <Box float="right">
                        <SpaceBetween direction="horizontal" size="xs">
                            <Button variant="link" onClick={() => this.setState({ showCreateUserModal: false })}>Cancel</Button>
                            <Button
                                variant="primary"
                                loading={this.state.createUserLoading}
                                onClick={() => {
                                    const email = this.state.createUserEmail.trim();
                                    if (!email) {
                                        this.setFlashMessage("Email is required.", "error");
                                        return;
                                    }
                                    this.setState({ createUserLoading: true });
                                    this.authAdmin()
                                        .createUser({
                                            user: {
                                                email: email,
                                                role: this.state.createUserRole,
                                            },
                                        })
                                        .then((_) => {
                                            this.setState({
                                                showCreateUserModal: false,
                                                createUserEmail: "",
                                                createUserRole: "user",
                                                createUserLoading: false,
                                            });
                                            this.getListing().fetchRecords();
                                            this.setFlashMessage(`User created successfully.`, "success");
                                        })
                                        .catch((error) => {
                                            this.setState({ createUserLoading: false });
                                            this.setFlashMessage(`Failed to create user: ${error.message}`, "error");
                                        });
                                }}
                            >
                                Create
                            </Button>
                        </SpaceBetween>
                    </Box>
                }
            >
                <SpaceBetween size="m">
                    <FormField label="Email" description="User's email address. Username will be derived from the email prefix (max 20 chars).">
                        <Input
                            value={this.state.createUserEmail}
                            onChange={(e) => this.setState({ createUserEmail: e.detail.value })}
                            placeholder="user@example.com"
                            type="email"
                        />
                    </FormField>
                    <FormField label="Role">
                        <Select
                            selectedOption={{ label: this.state.createUserRole, value: this.state.createUserRole }}
                            onChange={(e) => this.setState({ createUserRole: e.detail.selectedOption.value! })}
                            options={[
                                { label: "user", value: "user" },
                                { label: "admin", value: "admin" },
                            ]}
                        />
                    </FormField>
                </SpaceBetween>
            </Modal>
        );
    }

    buildDeleteUserModal() {
        const selectedUser = this.getSelectedUser();
        return (
            <Modal
                visible={this.state.showDeleteUserModal}
                onDismiss={() => this.setState({ showDeleteUserModal: false })}
                header="Delete User"
                footer={
                    <Box float="right">
                        <SpaceBetween direction="horizontal" size="xs">
                            <Button variant="link" onClick={() => this.setState({ showDeleteUserModal: false })}>Cancel</Button>
                            <Button
                                variant="primary"
                                loading={this.state.deleteUserLoading}
                                onClick={() => {
                                    if (!selectedUser) return;
                                    this.setState({ deleteUserLoading: true });
                                    this.authAdmin()
                                        .deleteUser({
                                            username: selectedUser.username,
                                        })
                                        .then((_) => {
                                            this.setState({ showDeleteUserModal: false, deleteUserLoading: false, userSelected: false });
                                            this.getListing().fetchRecords();
                                            this.setFlashMessage(`User ${selectedUser.username} deleted successfully.`, "success");
                                        })
                                        .catch((error) => {
                                            this.setState({ deleteUserLoading: false });
                                            this.setFlashMessage(`Failed to delete user: ${error.message}`, "error");
                                        });
                                }}
                            >
                                Delete
                            </Button>
                        </SpaceBetween>
                    </Box>
                }
            >
                <p>Are you sure you want to permanently delete user <b>{selectedUser?.username}</b>?</p>
                <p>This will remove the user from all projects and terminate any active VDI sessions.</p>
            </Modal>
        );
    }

    buildListing() {
        return (
            <IdeaListView
                ref={this.listing}
                preferencesKey={"users"}
                showPreferences={false}
                title="Users"
                description="Environment user management"
                selectionType="single"
                primaryAction={{
                    id: "add-user",
                    text: "Add User",
                    onClick: () => {
                        this.setState({ showCreateUserModal: true });
                    },
                }}
                secondaryActionsDisabled={!this.isSelected()}
                secondaryActions={[
                    {
                        id: "toggle-admin-user",
                        text: this.isSelectedUserAdmin() ? "Remove as Admin User" : "Set as Admin User",
                        onClick: () => {
                            this.getToggleAdminUserConfirmModal().show();
                        },
                    },
                    {
                        id: "toggle-user-enabled",
                        text: this.isSelectedUserEnabled() ? "Disable User" : "Enable User",
                        onClick: () => {
                            this.getToggleUserEnabledConfirmModal().show();
                        },
                    },
                    {
                        id: "delete-user",
                        text: "Delete User",
                        onClick: () => {
                            this.setState({ showDeleteUserModal: true });
                        },
                    },
                ]}
                showPaginator={true}
                showFilters={true}
                filters={[
                    {
                        key: "username",
                    },
                ]}
                onFilter={(filters) => {
                    const usernameToken = Utils.asString(filters[0].value).trim().toLowerCase();
                    if (Utils.isEmpty(usernameToken)) {
                        return [];
                    } else {
                        return [
                            {
                                key: "username",
                                like: usernameToken,
                            },
                        ];
                    }
                }}
                onRefresh={() => {
                    this.setState(
                        {
                            userSelected: false,
                        },
                        () => {
                            this.getListing().fetchRecords();
                        }
                    );
                }}
                onSelectionChange={() => {
                    this.setState({
                        userSelected: true,
                    });
                }}
                onFetchRecords={() => {
                    return this.authAdmin().listUsers({
                        filters: this.getListing().getFilters(),
                        paginator: this.getListing().getPaginator(),
                    });
                }}
                columnDefinitions={USER_TABLE_COLUMN_DEFINITIONS}
            />
        );
    }

    render() {
        return (
            <IdeaAppLayout
                ideaPageId={this.props.ideaPageId}
                toolsOpen={this.props.toolsOpen}
                tools={this.props.tools}
                onToolsChange={this.props.onToolsChange}
                onPageChange={this.props.onPageChange}
                sideNavHeader={this.props.sideNavHeader}
                sideNavItems={this.props.sideNavItems}
                onSideNavChange={this.props.onSideNavChange}
                onFlashbarChange={this.props.onFlashbarChange}
                flashbarItems={this.props.flashbarItems}
                breadcrumbItems={[
                    {
                        text: "RES",
                        href: "#/",
                    },
                    {
                        text: "Environment Management",
                        href: "#/cluster/status",
                    },
                    {
                        text: "Users",
                        href: "",
                    },
                ]}
                content={
                    <div>
                        {this.buildToggleAdminUserConfirmModal()}
                        {this.buildToggleUserEnabledConfirmModal()}
                        {this.buildCreateUserModal()}
                        {this.buildDeleteUserModal()}
                        {this.buildListing()}
                    </div>
                }
            />
        );
    }
}

export default withRouter(Users);
